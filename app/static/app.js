const $ = id => document.getElementById(id);
const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/transcribe`;
const box = $('transcript-container'), btn = $('toggle-mic-btn'), btnText = $('btn-text'), dot = $('recording-dot');
const PLACEHOLDER = box.innerHTML;

// Chunking: cut at a pause once we have >= MIN_S seconds, or force a cut at MAX_S.
const MIN_S = 2, MAX_S = 8, PAUSE_BLOCKS = 2, SILENCE_RMS = 0.005;

let recording = false, busyUpload = false, ws, tick, finishT, secs = 0;
let stream, actx, analyser, proc, SR = 16000;
let chunks = [], len = 0, silent = 0, heard = false, pending = 0, sent = 0, got = 0, empty = 0, everHeard = false;

/* ---------- UI helpers ---------- */
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 1800);
}
function setStatus(msg, kind = '') { const s = $('status-line'); s.textContent = msg; s.className = 'status ' + kind; }
function setModelHealth(ok, label) { $('model-dot').className = 'dot ' + (ok ? 'ok' : 'bad'); $('model-health').textContent = label; }
const getText = () => [...box.querySelectorAll('.seg')].map(p => p.textContent).join('\n');
const updateWords = () => { $('word-count').textContent = (getText().match(/\S+/g) || []).length; };
const pad = n => String(n).padStart(2, '0');
const renderTime = () => { $('lecture-timer').textContent = `${pad(Math.floor(secs / 3600))}:${pad(Math.floor(secs % 3600 / 60))}:${pad(secs % 60)}`; };

function addSegment(text, ms) {
  if (!text) return;
  $('placeholder-text')?.remove();
  const p = document.createElement('p');
  p.className = 'seg fresh'; p.dir = 'auto'; p.textContent = text;   // dir=auto: Urdu flows RTL, English LTR
  box.appendChild(p); box.scrollTop = box.scrollHeight;
  if (ms != null) $('latency-badge').textContent = Math.round(ms) + ' ms';
  updateWords();
}
function refreshStatus() {
  if (recording) setStatus(`Listening… ${sent} sent, ${got} transcribed${empty ? `, ${empty} empty` : ''}`, 'live');
}

/* ---------- Audio helpers ---------- */
function concat(list, n) { const out = new Float32Array(n); let o = 0; for (const c of list) { out.set(c, o); o += c.length; } return out; }
function toWav(samples, sr) {
  const b = new ArrayBuffer(44 + samples.length * 2), v = new DataView(b);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVEfmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return b;
}
function flush() {
  if (heard && len >= SR * 0.3 && ws?.readyState === 1) { ws.send(toWav(concat(chunks, len), SR)); pending++; sent++; }
  chunks = []; len = 0; silent = 0; heard = false; refreshStatus();
}

/* ---------- WebSocket ---------- */
function openSocket() {
  return new Promise((resolve, reject) => {
    const s = new WebSocket(WS_URL); s.binaryType = 'arraybuffer';
    s.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.type === 'ready') resolve(s);
      else if (m.type === 'error') reject(new Error(m.message));
      else onMsg(m);
    };
    s.onerror = () => reject(new Error('Cannot reach the server.'));
    s.onclose = () => { reject(new Error('Connection closed.')); if (recording) { setStatus('Connection lost. Press record to retry.', 'err'); stop(true); } };
  });
}
function onMsg(m) {
  if (m.type === 'segment') { pending = Math.max(0, pending - 1); got++; if (!m.text) empty++; addSegment(m.text, m.latency_ms); refreshStatus(); }
  else if (m.type === 'done') { clearTimeout(finishT); ws.close(); setStatus('Ready'); }
}

/* ---------- Record ---------- */
async function start() {
  if (busyUpload) return toast('Wait for the upload to finish');
  actx = new AudioContext({ sampleRate: 16000 });          // created inside the click so the browser allows it
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
  catch { actx.close(); return setStatus('Microphone blocked. Allow access in the browser and try again.', 'err'); }
  btn.disabled = true; setStatus('Connecting to the model…');
  try { ws = await openSocket(); }
  catch (err) { stream.getTracks().forEach(t => t.stop()); actx.close(); btn.disabled = false; setModelHealth(false, 'Unavailable'); return setStatus(err.message, 'err'); }
  btn.disabled = false; setModelHealth(true, 'Connected');
  await actx.resume(); SR = actx.sampleRate;
  const src = actx.createMediaStreamSource(stream);
  analyser = actx.createAnalyser(); analyser.fftSize = 128; src.connect(analyser);
  proc = actx.createScriptProcessor(4096, 1, 1); src.connect(proc); proc.connect(actx.destination);
  chunks = []; len = 0; silent = 0; heard = false; pending = 0; sent = got = empty = 0; everHeard = false; secs = 0; renderTime();
  proc.onaudioprocess = e => {
    if (!recording) return;
    const d = new Float32Array(e.inputBuffer.getChannelData(0));
    let sum = 0; for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
    if (Math.sqrt(sum / d.length) > SILENCE_RMS) { heard = true; everHeard = true; silent = 0; } else silent++;
    chunks.push(d); len += d.length;
    const sec = len / SR;
    if (!heard && sec >= MIN_S) { chunks = chunks.slice(-2); len = chunks.reduce((a, c) => a + c.length, 0); return; }  // drop silence, keep a short lead-in
    if (heard && ((sec >= MIN_S && silent >= PAUSE_BLOCKS) || sec >= MAX_S)) flush();
  };
  recording = true;
  btn.classList.add('recording'); btn.setAttribute('aria-pressed', 'true');
  btnText.textContent = 'Stop recording'; dot.classList.remove('hidden');
  tick = setInterval(() => { secs++; renderTime(); if (secs === 6 && !everHeard) setStatus('No sound detected. Check your microphone input and volume.', 'err'); }, 1000);
  refreshStatus();
}
function stop(abort = false) {
  if (!recording) return;
  if (!abort) flush();
  recording = false; clearInterval(tick);
  proc.onaudioprocess = null; proc.disconnect(); stream.getTracks().forEach(t => t.stop()); actx.close(); analyser = null;
  btn.classList.remove('recording'); btn.setAttribute('aria-pressed', 'false');
  btnText.textContent = 'Start recording'; dot.classList.add('hidden');
  if (!abort && ws.readyState === 1) {          // wait for the last chunk's text before closing
    setStatus('Finishing the last words…', 'live');
    ws.send('flush'); finishT = setTimeout(() => ws.close(), 30000);
  }
}
btn.addEventListener('click', () => recording ? stop() : start());

/* ---------- Upload ---------- */
function setPct(p, label) { $('bar-fill').style.width = Math.round(p * 100) + '%'; $('file-pct').textContent = label || Math.round(p * 100) + '%'; }
async function uploadFile(file) {
  if (recording) return toast('Stop recording first');
  if (busyUpload) return;
  busyUpload = true; $('upload-progress').classList.remove('hidden');
  $('file-name').textContent = file.name; setPct(0, 'Uploading…');
  try {
    const fd = new FormData(); fd.append('file', file);
    const r = await fetch('/api/transcribe-file', { method: 'POST', body: fd });
    if (!r.ok) throw new Error('server returned ' + r.status);
    setPct(0, 'Transcribing…');
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { done, value } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop();
      for (const l of lines) {
        if (!l.trim()) continue;
        const m = JSON.parse(l); if (m.error) throw new Error(m.error);
        addSegment(m.text); setPct(m.duration ? Math.min(1, m.end / m.duration) : 0);
      }
    }
    setPct(1); toast('Transcription complete');
  } catch (err) { setPct(0, 'Failed'); toast('Upload failed: ' + err.message); }
  finally { busyUpload = false; $('file-input').value = ''; }
}
const dz = $('drop-zone'), fi = $('file-input');
dz.onclick = () => fi.click();
dz.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } };
fi.onchange = () => fi.files[0] && uploadFile(fi.files[0]);
['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
dz.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) uploadFile(f); });

/* ---------- Transcript actions ---------- */
$('export-btn').onclick = () => {
  const t = getText(); if (!t) return toast('Nothing to download yet');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([t], { type: 'text/plain;charset=utf-8' }));
  a.download = `urdubol_transcript_${new Date().toISOString().slice(0, 10)}.txt`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
};
$('copy-btn').onclick = async () => {
  const t = getText(); if (!t) return toast('Nothing to copy yet');
  try { await navigator.clipboard.writeText(t); toast('Copied to clipboard'); } catch { toast('Copy not allowed by the browser'); }
};
$('clear-btn').onclick = () => {
  box.innerHTML = PLACEHOLDER; updateWords(); $('latency-badge').textContent = '— ms';
  if (!recording) { secs = 0; renderTime(); }
};

/* ---------- Waveform ---------- */
const cv = $('wave-canvas'), cx = cv.getContext('2d'), css = getComputedStyle(document.documentElement);
function draw() {
  const w = cv.clientWidth, h = cv.clientHeight, r = devicePixelRatio || 1;
  if (cv.width !== Math.round(w * r)) { cv.width = Math.round(w * r); cv.height = Math.round(h * r); }
  cx.setTransform(r, 0, 0, r, 0, 0); cx.clearRect(0, 0, w, h);
  const n = Math.floor(w / 7), data = new Uint8Array(64);
  if (analyser) analyser.getByteFrequencyData(data);
  for (let i = 0; i < n; i++) {
    const v = analyser ? data[i % 48] / 255 : .05 + .03 * Math.sin(i * .5);
    const bh = Math.max(3, v * h * .9);
    cx.fillStyle = analyser ? (i % 6 === 0 ? css.getPropertyValue('--rose') : css.getPropertyValue('--emerald')) : css.getPropertyValue('--sand');
    cx.beginPath(); cx.roundRect(i * 7 + 2, (h - bh) / 2, 3.5, bh, 2); cx.fill();
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

/* ---------- Startup checks ---------- */
fetch('/api/health').then(r => r.json()).then(() => setModelHealth(true, 'Ready')).catch(() => setModelHealth(false, 'Server offline'));
fetch('/api/samples').then(r => r.json()).then(list => {
  if (!list.length) return;
  $('samples').classList.remove('hidden');
  list.slice(0, 3).forEach(name => {
    const b = document.createElement('button'); b.className = 'chip'; b.textContent = name;
    b.onclick = async () => { const r = await fetch('/samples/' + encodeURIComponent(name)); uploadFile(new File([await r.blob()], name)); };
    $('sample-list').appendChild(b);
  });
}).catch(() => {});