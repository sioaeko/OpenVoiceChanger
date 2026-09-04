// Regenerates the README screenshots in docs/images from a running backend.
//
// Drives headless Edge/Chrome over the DevTools protocol. A synthetic voice
// (pulse train through vowel formants) is fed in as the fake microphone so the
// studio is captured *running*: spectrum, meters, round-trip latency, a take in
// progress — instead of an idle page. Everything else (presets, effects, the
// converter render, settings) uses the real UI and the real DSP backend.
//
//   npx vite build --config frontend/vite.config.js   (or: cd frontend && npm run build)
//   python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
//   node scripts/readme_screenshots.mjs
//
// Needs Node 22+ (built-in WebSocket) and a Chromium browser; set OVC_BROWSER
// to its executable if it is not in one of the default locations.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'docs', 'images');
const BASE_URL = process.env.OVC_URL || 'http://127.0.0.1:8000';
const DEBUG_PORT = 9337;

const BROWSER_CANDIDATES = [
  process.env.OVC_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Synthetic voice -------------------------------------------------------

/** A few seconds of vowel-like speech: pulsed source, three formants, syllable rhythm. */
function synthesizeVoice(sampleRate = 48000) {
  const VOWELS = {
    a: [730, 1090, 2440],
    e: [530, 1840, 2480],
    i: [270, 2290, 3010],
    o: [570, 840, 2410],
    u: [300, 870, 2240],
  };
  // [vowel or null for a pause, seconds, f0 start, f0 end]
  const phrase = [
    ['a', 0.28, 128, 118], ['e', 0.22, 122, 140], [null, 0.08], ['i', 0.26, 150, 132],
    ['o', 0.3, 126, 110], [null, 0.22], ['u', 0.24, 118, 130], ['a', 0.34, 138, 104],
    [null, 0.12], ['e', 0.2, 124, 136], ['i', 0.22, 146, 128], ['o', 0.36, 120, 98],
    [null, 0.45],
  ];

  const total = Math.round(phrase.reduce((sum, seg) => sum + seg[1], 0) * sampleRate);
  const out = new Float32Array(total);
  let cursor = 0;
  let phase = 0;
  let noiseState = 0x2f6e2b1;
  const noise = () => {
    noiseState = (noiseState * 1103515245 + 12345) >>> 0;
    return noiseState / 0x100000000 - 0.5;
  };

  for (const [vowel, seconds, f0Start, f0End] of phrase) {
    const length = Math.round(seconds * sampleRate);
    if (!vowel) {
      cursor += length;
      continue;
    }
    // Second-order resonators, one per formant (constant-Q bandpass).
    const filters = VOWELS[vowel].map((freq, index) => {
      const bandwidth = [90, 110, 160][index];
      const r = Math.exp(-Math.PI * bandwidth / sampleRate);
      return { a1: -2 * r * Math.cos(2 * Math.PI * freq / sampleRate), a2: r * r, y1: 0, y2: 0,
        gain: [1, 0.5, 0.25][index] };
    });
    for (let i = 0; i < length; i += 1) {
      const t = i / length;
      const f0 = f0Start + (f0End - f0Start) * t + 3 * Math.sin(2 * Math.PI * 5.5 * (cursor + i) / sampleRate);
      phase += f0 / sampleRate;
      let pulse = 0;
      if (phase >= 1) {
        phase -= 1;
        pulse = 1;
      }
      // Glottal source: sharp pulse plus a little aspiration noise.
      const source = pulse + 0.02 * noise();
      let sample = 0;
      for (const f of filters) {
        const y = source - f.a1 * f.y1 - f.a2 * f.y2;
        f.y2 = f.y1;
        f.y1 = y;
        sample += y * f.gain;
      }
      const attack = Math.min(1, i / (0.03 * sampleRate));
      const release = Math.min(1, (length - i) / (0.06 * sampleRate));
      out[cursor + i] = sample * attack * release;
    }
    cursor += length;
  }

  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const scale = peak > 0 ? 0.5 / peak : 1;

  const wav = Buffer.alloc(44 + out.length * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + out.length * 2, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(out.length * 2, 40);
  for (let i = 0; i < out.length; i += 1) {
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out[i] * scale)) * 32767), 44 + i * 2);
  }
  return wav;
}

// --- DevTools client -------------------------------------------------------

async function waitForTarget() {
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`);
      const page = (await res.json()).find((t) => t.type === 'page');
      if (page) return page;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('The browser did not expose a page target');
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pending = new Map();
    const errors = [];
    let nextId = 1;
    ws.onopen = () => resolve({ send, evaluate, errors, close: () => ws.close() });
    ws.onerror = reject;
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        errors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      }
    };
    function send(method, params = {}) {
      return new Promise((done, fail) => {
        const id = nextId++;
        pending.set(id, (msg) => (msg.error ? fail(new Error(`${method}: ${msg.error.message}`)) : done(msg.result)));
        ws.send(JSON.stringify({ id, method, params }));
      });
    }
    async function evaluate(expression) {
      const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (res.exceptionDetails) {
        throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
      }
      return res.result?.value;
    }
  });
}

// --- Capture -----------------------------------------------------------------

async function main() {
  const browser = BROWSER_CANDIDATES.find((path) => existsSync(path));
  if (!browser) throw new Error('No Chromium browser found; set OVC_BROWSER.');

  const health = await fetch(`${BASE_URL}/api/config`).catch(() => null);
  if (!health?.ok) throw new Error(`Backend not reachable at ${BASE_URL} — start uvicorn first.`);

  const work = mkdtempSync(join(tmpdir(), 'ovc-readme-'));
  const voicePath = join(work, 'voice.wav');
  writeFileSync(voicePath, synthesizeVoice());
  mkdirSync(OUT_DIR, { recursive: true });

  const proc = spawn(browser, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
    '--force-prefers-reduced-motion',
    // Auto-grant the microphone and feed the synthetic voice through it.
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${voicePath}`,
    '--autoplay-policy=no-user-gesture-required',
    // Headless still plays to the default output device; the converted voice
    // would come out of the speakers of whoever runs this. The audio graph
    // keeps rendering (meters and spectrum stay live), only the sink is muted.
    '--mute-audio',
    `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${join(work, 'profile')}`,
    '--window-size=1600,1000', 'about:blank',
  ], { stdio: 'ignore' });

  const shots = [];
  try {
    const target = await waitForTarget();
    const cdp = await connect(target.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');

    const viewport = (width, height) => cdp.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 2, mobile: false,
    });
    const shoot = async (name, clip = null) => {
      // The clip's own scale multiplies the emulated deviceScaleFactor, so it
      // stays at 1 to keep every image at the same 2x density.
      const res = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
      });
      const file = join(OUT_DIR, name);
      writeFileSync(file, Buffer.from(res.data, 'base64'));
      shots.push(name);
    };
    const click = (selector) => cdp.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('missing ' + ${JSON.stringify(selector)}); el.click(); return true; })()`);
    // First <button> inside `scope` whose text contains `text` (preset chips
    // start with an emoji, so a prefix match would miss them).
    const clickText = (scope, text) => cdp.evaluate(`(() => {
      const root = document.querySelector(${JSON.stringify(scope)}) || document;
      const el = [...root.querySelectorAll('button')].find((b) => b.textContent.includes(${JSON.stringify(text)}));
      if (!el) throw new Error('no button ' + ${JSON.stringify(text)});
      el.click(); return true; })()`);
    const waitFor = async (expression, timeoutMs = 15000, label = expression) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (await cdp.evaluate(expression)) return;
        await sleep(250);
      }
      throw new Error(`Timed out waiting for ${label}`);
    };

    await viewport(1600, 1000);
    await cdp.send('Page.navigate', { url: `${BASE_URL}/` });
    await waitFor(`document.body.innerText.includes('LIVE')`, 15000, 'websocket');

    // 1. Studio, running: Deep Voice preset, a take in progress.
    await clickText('#presets', 'Deep Voice');
    await clickText('#panel-studio', 'Start Voice Changer');
    await waitFor(`document.querySelector('[aria-label="Conversion bypass"]') && document.body.innerText.includes('Stop')`, 20000, 'audio pipeline start');
    // innerText reflects text-transform, hence the case-insensitive match.
    await waitFor(`/round trip\\s+\\d+/i.test(document.body.innerText)`, 15000, 'a round-trip measurement');
    await sleep(1500);
    await clickText('#panel-studio', 'Record');
    await sleep(4200);
    await cdp.evaluate('window.scrollTo(0, 0)');
    await shoot('main-ui.png');

    // 2. Presets + effects rack, clipped to the two panels. The viewport is
    // made tall enough for the whole studio so the clip needs no scrolling
    // (clip coordinates are viewport-relative).
    await viewport(1600, 2400);
    await clickText('#presets', 'Ghost');
    await sleep(600);
    const pageHeight = await cdp.evaluate('document.documentElement.scrollHeight');
    if (pageHeight > 2400) await viewport(1600, pageHeight);
    await cdp.evaluate('window.scrollTo(0, 0)');
    // 12px of breathing room: the panels above and below sit 20px away, so a
    // wider margin would catch the edge of the Voice Lab.
    const rect = await cdp.evaluate(`(() => {
      const a = document.getElementById('presets').getBoundingClientRect();
      const b = document.getElementById('effects').getBoundingClientRect();
      return { x: Math.floor(a.left) - 12, y: Math.floor(a.top) - 12, width: Math.ceil(a.width) + 24, height: Math.ceil(b.bottom - a.top) + 24 };
    })()`);
    await shoot('effects-rack.png', rect);

    // 3. Settings, with the measured recommendation populated by the live stream.
    await viewport(1600, 1000);
    await cdp.evaluate('window.scrollTo(0, 0)');
    await click('[aria-label="Open settings"]');
    await sleep(800);
    await shoot('settings-modal.png');
    await click('[aria-label="Close settings"]');
    await sleep(300);

    // 4. Converter: a real render of the synthetic voice through the DSP chain.
    await viewport(1600, 860);
    await click('#tab-converter');
    await sleep(400);
    const { root } = await cdp.send('DOM.getDocument', { depth: 1 });
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#panel-converter input[type=file]' });
    await cdp.send('DOM.setFileInputFiles', { nodeId, files: [voicePath] });
    await sleep(400);
    await clickText('#panel-converter', 'Convert');
    await waitFor(`document.body.innerText.includes('Download WAV')`, 60000, 'the converted file');
    await sleep(500);
    await shoot('converter.png');

    // 5. Models.
    await click('#tab-models');
    await sleep(800);
    await shoot('models.png');

    await clickText('#panel-studio', 'Stop');
    await sleep(300);
    cdp.close();

    const relevant = cdp.errors.filter((e) => !/favicon/.test(e));
    if (relevant.length) {
      console.warn(`Console errors during capture:\n  ${relevant.join('\n  ')}`);
    }
  } finally {
    // Give the browser time to release its profile before deleting it; a
    // cleanup failure must not mask the real error either way.
    const exited = new Promise((resolve) => proc.once('exit', resolve));
    proc.kill();
    await Promise.race([exited, sleep(5000)]);
    try {
      rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (err) {
      console.warn(`Could not remove ${work}: ${err.message}`);
    }
  }

  console.log(`Wrote ${shots.length} screenshots to ${OUT_DIR}:\n  ${shots.join('\n  ')}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
