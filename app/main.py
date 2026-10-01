import asyncio
import json
import os
import shutil
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from app.websocket import router as websocket_router, get_engine
from app.engine import UrduTranscriptionEngine

AUDIO_EXT = {".mp3", ".wav", ".m4a", ".ogg", ".flac", ".webm", ".mp4"}
SAMPLES = Path("samples")


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Starting Urdu Lecture Transcriber server...")
    try:
        await asyncio.to_thread(get_engine)  # warm the model so the first request is instant
    except Exception as e:
        print(f"⚠️ Model preload failed ({e}); it will retry on first request.")
    yield
    print("🛑 Shutting down server...")


app = FastAPI(title="Urdu Lecture Transcriber", version="1.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

app.mount("/static", StaticFiles(directory="app/static"), name="static")
if SAMPLES.is_dir():
    app.mount("/samples", StaticFiles(directory=SAMPLES), name="samples")
app.include_router(websocket_router)


@app.get("/")
async def get_index():
    return FileResponse("app/static/index.html")


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/samples")
async def list_samples():
    if not SAMPLES.is_dir():
        return []
    return sorted(p.name for p in SAMPLES.iterdir() if p.suffix.lower() in AUDIO_EXT)


@app.post("/api/transcribe-file")
async def transcribe_file(file: UploadFile = File(...)):
    """Stream newline-delimited JSON segments as the file is transcribed."""
    fd, path = tempfile.mkstemp(suffix=Path(file.filename or "").suffix or ".audio")
    with os.fdopen(fd, "wb") as tmp:
        await asyncio.to_thread(shutil.copyfileobj, file.file, tmp)
    engine = await asyncio.to_thread(get_engine)

    def stream():
        try:
            for seg in engine.transcribe_file(path):
                yield json.dumps(seg, ensure_ascii=False) + "\n"
        except Exception as e:
            yield json.dumps({"error": str(e)}) + "\n"
        finally:
            os.unlink(path)

    return StreamingResponse(stream(), media_type="application/x-ndjson")