const $ = id => document.getElementById(id);

const btn = $('toggle-mic-btn');
const btnText = $('btn-text');
const dot = $('recording-dot');
const box = $('transcript-container');
const ph = $('placeholder-text');

let recording = false;
let tick = null;
let secs = 0;
let ws = null;
let audioCtx = null;
let mediaStream = null;
let processor = null;
let pcmBuffer = [];

const WS_URL = `ws://${window.location.host}/ws/transcribe`;

function addSegment(text, latencyMs) {
  if (!text) return;
  if (ph) ph.remove();

  const p = document.createElement('p');
  p.className = 'fresh';
  p.textContent = text;
  box.appendChild(p);
  box.scrollTop = box.scrollHeight;

  if (latencyMs != null) {
    $('latency-badge').textContent = Math.round(latencyMs) + ' ms';
  }
  updateWords();
}

function setModelHealth(ok, label) {
  $('model-dot').style.background = ok ? '#10B981' : '#EF4444';
  $('model-health').textContent = label || (ok ? 'CTranslate2 تیار' : 'ماڈل میں خرابی');
}

const getText = () => [...box.querySelectorAll('p')].map(p => p.textContent).join('\n');
const words = () => (getText().trim().match(/\S+/g) || []).length;
function updateWords() { $('word-count').textContent = words(); }

const pad = n => String(n).padStart(2, '0');
function renderTime() {
  (('lecture-timer').textContent = `\){pad(Math.floor(secs / 3600))}:\({pad(Math.floor((secs % 3600) / 60))}:\){pad(secs % 60)}`);
}

// Convert PCM Float32 buffer into a valid WAV binary ArrayBuffer for scipy.io.wavfile
function createWavBuffer(samples, sampleRate = 16000) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  /* RIFF chunk descriptor */
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  /* fmt sub-chunk */
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true);  // AudioFormat (1 for PCM)
  view.setUint16(22, 1, true);  // NumChannels (1 = mono)
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // ByteRate
  view.setUint16(32, 2, true);  // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  /* data sub-chunk */
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  // Write PCM samples (convert float32 to int16)
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return buffer;
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

async function start() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const source = audioCtx.createMediaStreamSource(mediaStream);

    // Capture PCM data using AudioWorklet or ScriptProcessor
    processor = audioCtx.createScriptProcessor(4096, 1, 1);
    source.connect(processor);
    processor.connect(audioCtx.destination);

    ws = new WebSocket(WS_URL);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => setModelHealth(true, "متصل - CTranslate2");
    ws.onmessage = e => {
      const data = JSON.parse(e.data);
      addSegment(data.text, data.latency_ms);
    };
    ws.onerror = () => setModelHealth(false, 'کنکشن میں خرابی');

    processor.onaudioprocess = (e) => {
      if (!recording) return;
      const channelData = e.inputBuffer.getChannelData(0);
      pcmBuffer.push(...channelData);

      // Send chunk every ~3 seconds of recorded audio
      if (pcmBuffer.length >= 16000 * 3) {
        if (ws && ws.readyState === WebSocket.OPEN) {
          const wavBuffer = createWavBuffer(new Float32Array(pcmBuffer), 16000);
          ws.send(wavBuffer);
        }
        pcmBuffer = []; // Clear buffer for next chunk
      }
    };

    recording = true;
    btn.classList.add('recording');
    btnText.textContent = 'ریکارڈنگ روکیں';
    dot.classList.remove('hidden');
    tick = setInterval(() => { secs++; renderTime(); }, 1000);

  } catch (err) {
    console.error("Mic access or WS error:", err);
    setModelHealth(false, 'مائیک فعال نہیں ہو سکا');
  }
}

function stop() {
  recording = false;
  clearInterval(tick);
  btn.classList.remove('recording');
  btnText.textContent = 'ریکارڈنگ شروع کریں';
  dot.classList.add('hidden');

  // Send any remaining audio buffer before closing
  if (pcmBuffer.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
    const wavBuffer = createWavBuffer(new Float32Array(pcmBuffer), 16000);
    ws.send(wavBuffer);
    pcmBuffer = [];
  }

  if (processor) processor.disconnect();
  if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
  if (audioCtx) audioCtx.close();
  if (ws) ws.close();
}

btn.addEventListener('click', () => recording ? stop() : start());

// Utility Buttons
function download() {
  const t = getText();
  if (!t) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([t], { type: 'text/plain;charset=utf-8' }));
  a.download = `urdubol_transcript_${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
}

$('export-btn').onclick = download;
$('download-btn').onclick = download;

$('copy-btn').onclick = async () => {
  try {
    await navigator.clipboard.writeText(getText());
    alert('متن کاپی ہو گیا ہے');
  } catch (e) {}
};

$('clear-btn').onclick = () => {
  box.innerHTML = '';
  box.appendChild(ph);
  secs = 0;
  renderTime();
  updateWords();
  $('latency-badge').textContent = '— ms';
};