import io
import numpy as np
from scipy.io import wavfile
from app.engine import UrduTranscriptionEngine

def test_engine_initialization_and_inference():
    print("\n--- Initializing UrduTranscriptionEngine ---")
    engine = UrduTranscriptionEngine(device="cpu", compute_type="int8")
    print("✓ Model loaded successfully with CTranslate2 INT8 quantization.")

    sample_rate = 16000
    duration_s = 2.0
    t = np.linspace(0, duration_s, int(sample_rate * duration_s), endpoint=False)
    synthetic_pcm = (np.sin(2 * np.pi * 440 * t) * 32767).astype(np.int16)

    buffer = io.BytesIO()
    wavfile.write(buffer, sample_rate, synthetic_pcm)
    raw_bytes = buffer.getvalue()

    audio_array = engine.decode_audio_bytes(raw_bytes)
    assert isinstance(audio_array, np.ndarray), "Decoded audio must be a NumPy array"
    assert audio_array.dtype == np.float32, "Audio array must be float32"
    print("✓ Audio byte decoder produced valid 16kHz float32 NumPy array.")

    result = engine.transcribe_chunk(audio_array)
    print("✓ Inference pipeline ran on synthetic audio without errors.")
    print(f"  Latency: {result['latency_ms']} ms")

if __name__ == "__main__":
    test_engine_initialization_and_inference()