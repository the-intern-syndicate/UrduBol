import time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

# Try importing Ramlah's engine; fallback gracefully until she finishes engine.py
try:
    from app.engine import transcribe_audio_bytes
except ImportError:
    def transcribe_audio_bytes(audio_bytes: bytes) -> str:
        # Fallback dummy response for UI testing
        return "صوتی سگنل موصول ہوا..." 

@router.websocket("/ws/transcribe")
async def websocket_transcribe(websocket: WebSocket):
    await websocket.accept()
    print("Client connected to transcription WebSocket.")
    
    try:
        while True:
            # Receive raw audio bytes (WebM/WAV/PCM) from client browser
            audio_bytes = await websocket.receive_bytes()
            
            if not audio_bytes or len(audio_bytes) < 100:
                continue

            start_time = time.time()
            
            # Pass audio bytes to engine
            text = transcribe_audio_bytes(audio_bytes)
            
            latency_ms = int((time.time() - start_time) * 1000)

            # Send back json payload
            if text and text.strip():
                await websocket.send_json({
                    "text": text.strip(),
                    "latency_ms": latency_ms
                })

    except WebSocketDisconnect:
        print("Client disconnected from WebSocket.")
    except Exception as e:
        print(f"WebSocket Error: {e}")
        await websocket.close()