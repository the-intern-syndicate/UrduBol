import asyncio
from fastapi import APIRouter, WebSocket
from app.engine import UrduTranscriptionEngine

router = APIRouter()
_engine = None


def get_engine():
    global _engine
    if _engine is None:
        print("⏳ Loading UrduTranscriptionEngine model into RAM... (first run downloads the model)")
        _engine = UrduTranscriptionEngine(device="cpu", compute_type="int8")
        print("✅ UrduTranscriptionEngine loaded successfully!")
    return _engine


def _process(engine, audio_bytes: bytes) -> dict:
    return engine.transcribe_chunk(engine.decode_audio_bytes(audio_bytes))


@router.websocket("/ws/transcribe")
async def websocket_transcribe(ws: WebSocket):
    await ws.accept()
    print("Client connected to transcription WebSocket.")
    try:
        engine = await asyncio.to_thread(get_engine)   # never block the event loop
    except Exception as e:
        print(f"Failed to load model: {e}")
        await ws.send_json({"type": "error", "message": f"Model failed to load: {e}"})
        await ws.close()
        return
    await ws.send_json({"type": "ready"})

    try:
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                break
            if msg.get("bytes") is not None:
                data = msg["bytes"]
                result = {"text": "", "latency_ms": 0.0}
                if len(data) >= 100:
                    try:
                        result = await asyncio.to_thread(_process, engine, data)
                        print(f"📝 {result['latency_ms']} ms -> {result['text'][:60]}")
                    except Exception as err:
                        print(f"Error processing audio chunk: {err}")
                # Always reply, even when empty, so the UI can track pending chunks.
                await ws.send_json({"type": "segment", **result})
            elif msg.get("text") == "flush":
                await ws.send_json({"type": "done"})   # all earlier chunks are already answered
    except Exception as e:
        print(f"WebSocket closed: {e}")
    print("Client disconnected from WebSocket.")