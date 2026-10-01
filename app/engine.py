import io
import os
import time
import numpy as np
from scipy.io import wavfile
from faster_whisper import WhisperModel

# Override with an env var to try another CTranslate2 model, e.g.
#   set URDUBOL_MODEL=deepdml/faster-whisper-large-v3-turbo-ct2
DEFAULT_MODEL = os.getenv("URDUBOL_MODEL", "kingabzpro/whisper-large-v3-urdu-ct2")

# English terms that show up in lectures. They are written in Latin script inside an Urdu
# sentence; this nudges Whisper to keep such words in English instead of transliterating
# them into Urdu script. Edit this list to match your courses.
ENGLISH_TERMS = [
    "Machine Learning", "Deep Learning", "Neural Network", "Python", "Algorithm",
    "Data Structure", "Database", "Operating System", "Artificial Intelligence", "Computer Science",
]
INITIAL_PROMPT = "یہ کمپیوٹر سائنس کا لیکچر ہے۔ آج ہم " + "، ".join(ENGLISH_TERMS[:5]) + " کے بارے میں بات کریں گے۔"


class UrduTranscriptionEngine:
    def __init__(self, model_id: str = DEFAULT_MODEL, device: str = "cpu", compute_type: str = "int8"):
        self.model = WhisperModel(model_id, device=device, compute_type=compute_type)

    # ---------- decoding ----------
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

    def decode_file(self, path: str) -> np.ndarray:
        """Plain .wav files are read with scipy (no PyAV needed); everything else uses PyAV."""
        if path.lower().endswith(".wav"):
            try:
                with open(path, "rb") as f:
                    return self.decode_audio_bytes(f.read())
            except Exception:
                pass  # e.g. 24-bit wav, fall through to PyAV
        try:
            from faster_whisper.audio import decode_audio
            audio = decode_audio(path, sampling_rate=16000, split_stereo=False)
            if isinstance(audio, tuple):  # only returned when split_stereo=True; satisfies the type checker
                audio = audio[0]
            return audio
        except Exception as e:
            raise RuntimeError(
                f"Could not decode this file ({e}). Try: pip install -U av faster-whisper, or upload a .wav file."
            )

    # ---------- transcription ----------
    def transcribe_chunk(self, audio_data: np.ndarray) -> dict:
        """Live mode: greedy decoding (beam_size=1) keeps latency low on CPU."""
        start_time = time.perf_counter()
        if len(audio_data) == 0:
            return {"text": "", "latency_ms": 0.0}

        segments, _ = self.model.transcribe(
            audio_data, language="ur", task="transcribe", beam_size=1,
            vad_filter=True, vad_parameters=dict(min_silence_duration_ms=300),
            initial_prompt=INITIAL_PROMPT, condition_on_previous_text=False,
        )
        text = " ".join(s.text.strip() for s in segments).strip()
        return {"text": text, "latency_ms": round((time.perf_counter() - start_time) * 1000, 2)}

    def transcribe_file(self, path: str):
        """File mode: higher quality (beam_size=5). Yields one dict per segment."""
        audio = self.decode_file(path)
        duration = len(audio) / 16000
        segments, _ = self.model.transcribe(
            audio, language="ur", task="transcribe", beam_size=5,
            vad_filter=True, initial_prompt=INITIAL_PROMPT,
        )
        for s in segments:
            yield {"text": s.text.strip(), "start": s.start, "end": s.end, "duration": duration}