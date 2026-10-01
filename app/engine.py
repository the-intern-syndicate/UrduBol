import io
import time
import numpy as np
from scipy.io import wavfile
from faster_whisper import WhisperModel

class UrduTranscriptionEngine:
    def __init__(self, model_id: str = "kingabzpro/whisper-large-v3-urdu-ct2", device: str = "cpu", compute_type: str = "int8"):
        # Using the pre-converted CTranslate2 Urdu model directly from Hugging Face
        self.model = WhisperModel(
            model_id,
            device=device,
            compute_type=compute_type
        )

    def decode_audio_bytes(self, audio_bytes: bytes) -> np.ndarray:
        with io.BytesIO(audio_bytes) as audio_file:
            sample_rate, data = wavfile.read(audio_file)

        if len(data.shape) > 1:
            data = data.mean(axis=1)

        if data.dtype == np.int16:
            audio_array = data.astype(np.float32) / 32768.0
        elif data.dtype == np.int32:
            audio_array = data.astype(np.float32) / 2147483648.0
        elif data.dtype == np.uint8:
            audio_array = (data.astype(np.float32) - 128.0) / 128.0
        else:
            audio_array = data.astype(np.float32)

        if sample_rate != 16000:
            target_length = int(len(audio_array) * 16000 / sample_rate)
            indices = np.linspace(0, len(audio_array) - 1, target_length)
            audio_array = np.interp(indices, np.arange(len(audio_array)), audio_array).astype(np.float32)

        return audio_array

    def transcribe_chunk(self, audio_data: np.ndarray) -> dict:
        start_time = time.perf_counter()

        if len(audio_data) == 0:
            return {"text": "", "latency_ms": 0.0}

        segments, _ = self.model.transcribe(
            audio_data,
            language="ur",
            task="transcribe",
            beam_size=5,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=300)
        )

        transcribed_text = " ".join([segment.text.strip() for segment in segments]).strip()
        latency_ms = round((time.perf_counter() - start_time) * 1000, 2)

        return {
            "text": transcribed_text,
            "latency_ms": latency_ms
        }