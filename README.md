# 🎙️ UrduBol (اردو بول): Urdu Lecture Transcriber

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![Python](https://img.shields.io/badge/Python-3.10%2B-blue)
![Runs on-device](https://img.shields.io/badge/Inference-100%25%20on--device-064E3B)

**Real-time Urdu lecture transcription that runs entirely on your own laptop.**
اردو لیکچرز کی فوری تحریر، بغیر انٹرنیٹ اور بغیر کسی کلاؤڈ سروس کے۔

<!-- Save a screenshot of the app as docs/screenshot.png -->
![UrduBol screenshot](docs/screenshot.png)

---

## 🚀 What We Built

UrduBol makes COMSATS university lectures easier to review and search. Press record in your browser, or upload a recording, and the spoken Urdu appears as text in a right-to-left transcript. Everything runs locally with open-weight AI, so student audio never leaves the device and the app keeps working when campus internet does not.

**Features**

- 🎤 **Live recording.** Text appears after each pause in speech, with a live waveform, timer, word count and latency.
- 📁 **Audio upload.** Drag and drop MP3, WAV, M4A, OGG or FLAC; segments stream into the transcript as they are decoded.
- 🔤 **Built for Urdu.** RTL transcript, Nastaliq headings, and a prompt that nudges the model to keep English terms such as "Machine Learning" in English.
- 📋 **Export.** Copy to clipboard or download as `.txt`.
- 🔒 **Private by design.** No paid API, no cloud calls, no data upload.

## 🧠 How the AI Works

Open-weight AI is the core engine. Instead of calling a closed, paid API, audio is processed on-device with **faster-whisper**.

1. **Capture.** The browser records microphone audio at 16 kHz and cuts it at natural pauses (2 to 8 seconds), so words are not split in half.
2. **Transport.** Each chunk is wrapped as a small WAV file and sent over a WebSocket to the local FastAPI server. Uploaded files go through an HTTP endpoint instead.
3. **Inference.** A Whisper large-v3 model fine-tuned for Urdu runs on the **CTranslate2** engine with **INT8 quantization**, which keeps memory and CPU use low enough for a standard laptop. Silero VAD removes silence before decoding.
4. **Display.** The server returns JSON segments that the page renders immediately, along with latency.

For the full pipeline, protocol tables, design decisions and a demo script, see [WORKFLOW.md](WORKFLOW.md).

## 🛠️ Built With

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, vanilla JavaScript, Web Audio API |
| Backend | FastAPI, Uvicorn, WebSockets |
| AI / inference | faster-whisper, CTranslate2, Silero VAD |
| Model | OpenAI Whisper large-v3, Urdu fine-tune (`kingabzpro/whisper-large-v3-urdu-ct2`) |
| Audio decoding | SciPy, NumPy, PyAV |
| AI pair programmer | GitHub Copilot |

## 💻 Run the Demo Locally

**Requirements:** Python 3.10+, a microphone, Chrome or Edge, and a few GB of free disk space for the first model download.

```bash
# 1. Clone and enter the project
git clone https://github.com/your-username/urdu-transcriber.git
cd urdu-transcriber

# 2. Create a virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Linux / macOS

# 3. Install dependencies
pip install -r requirements.txt

# 4. Start the server
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Wait for `✅ UrduTranscriptionEngine loaded successfully!` (the first run downloads the model), then open **http://127.0.0.1:8000**.

- Click **Start recording** and speak Urdu, or
- drop an audio file into **Upload audio**, or
- put a few clips in `samples/` and click a "Try a sample" chip.

**Optional:** to try a different CTranslate2 model, set `URDUBOL_MODEL` before starting the server.

## 📂 Project Structure

```text
urdu-transcriber/
├── app/
│   ├── main.py          # FastAPI app, upload endpoint, model warm-up
│   ├── websocket.py     # Live transcription WebSocket
│   ├── engine.py        # Whisper / CTranslate2 engine
│   └── static/          # index.html, style.css, app.js
├── samples/             # Optional demo audio
├── tests/
├── requirements.txt
├── WORKFLOW.md          # Architecture and team workflow
└── LICENSE
```

## 🗺️ Roadmap

- [x] Real-time streaming over WebSocket
- [x] On-device INT8 Whisper inference
- [x] Bilingual dashboard with live recording and file upload
- [ ] Spelling and domain-vocabulary improvements
- [ ] SRT subtitle and PDF export
- [ ] AudioWorklet capture, self-hosted fonts, GPU option

## 👥 Team

| Area | Owner |
|---|---|
| ASR engine and tuning | Ramlah |
| Frontend and pipeline | Ifra Ahmed |

## 🤖 How GitHub Copilot Helped

<!-- TODO: edit this section so it matches how your team actually used Copilot. -->

We used GitHub Copilot as an AI pair programmer during the hackathon, mainly for:

- **Boilerplate:** project scaffolding and repetitive UI and endpoint code.
- **Audio handling:** helping with the NumPy and WAV conversion logic for the browser-to-server audio chunks.
- **Documentation:** structuring code comments and drafting parts of this documentation.

## ⚖️ Open Source & Model Licensing

This project is open source under the **MIT License** (see [LICENSE](LICENSE)). The AI components are freely available open-weight or open-source technologies:

| Component | License |
|---|---|
| [OpenAI Whisper](https://github.com/openai/whisper) | MIT |
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | MIT |
| [CTranslate2](https://github.com/OpenNMT/CTranslate2) | MIT |
| [Silero VAD](https://github.com/snakers4/silero-vad) | MIT |
| Urdu fine-tune: [kingabzpro/whisper-large-v3-urdu-ct2](https://huggingface.co/kingabzpro/whisper-large-v3-urdu-ct2) | See the license on its Hugging Face model card |

## 🔧 Troubleshooting

- **Nothing appears while recording:** check the status line under the waveform. `0 sent` means the browser is not capturing audio (check microphone permission); `empty` means the model returned no text.
- **Upload fails with an `open()` error:** run `pip install -U av faster-whisper`, or upload a `.wav`.
- **First start is slow:** the model is downloading. Wait for the "loaded" message in the terminal.

More in [WORKFLOW.md](WORKFLOW.md#11-troubleshooting).