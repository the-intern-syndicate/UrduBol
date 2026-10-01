from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.engine import UrduTranscriptionEngine

router = APIRouter()

_engine = None

def get_engine():
    global _engine
    if _engine is None:
        print("⏳ Loading UrduTranscriptionEngine model into RAM... (First load may take a moment)")
        _engine = UrduTranscriptionEngine(device="cpu", compute_type="int8")
        print("✅ UrduTranscriptionEngine loaded successfully!")
    return _engine


@router.websocket("/ws/transcribe")
async def websocket_transcribe(websocket: WebSocket):
    await websocket.accept()
    print("Client connected to transcription WebSocket.")

    try:
        engine = get_engine()
    except Exception as e:
        print(f"Failed to load model: {e}")
        await websocket.send_json({
            "text": "ماڈل لوڈ کرنے میں ناکامی",
            "latency_ms": 0.0
        })

    try:
        while True:
            audio_bytes = await websocket.receive_bytes()

            if not audio_bytes or len(audio_bytes) < 100:
                continue

            try:
                # 1. Decode audio bytes into numpy array (16kHz float32)
                audio_array = engine.decode_audio_bytes(audio_bytes)

                # 2. Transcribe chunk using CTranslate2
                result = engine.transcribe_chunk(audio_array)

                # 3. Send back JSON payload
                if result.get("text"):
                    await websocket.send_json(result)

            except Exception as chunk_err:
                print(f"Error processing audio chunk: {chunk_err}")

    except WebSocketDisconnect:
        print("Client disconnected from WebSocket.")
    except Exception as e:
        print(f"WebSocket Error: {e}")