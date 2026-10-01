from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from app.websocket import router as websocket_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Starting Urdu Lecture Transcriber server...")
    yield
    print("🛑 Shutting down server...")

app = FastAPI(
    title="Urdu Lecture Transcriber",
    version="1.0.0",
    lifespan=lifespan
)

# CORS setup for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static directory for CSS/JS
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# Include WebSocket routes
app.include_router(websocket_router)

@app.get("/")
async def get_index():
    return FileResponse("app/static/index.html")