import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.replace(/\r\n/g, '\n').match(/<script>([\s\S]*?)<\/script>/)[1];

test('Ripple is a single-file loop instrument', () => {
  assert.match(html, /<title>Ripple/);
  assert.match(html, /id="centerAction"/);
  assert.match(html, /class="hint"/);
  assert.match(html, /AudioWorklet/);
  assert.match(html, /OfflineAudioContext/);
  assert.match(html, /MAX_LAYERS = 5/);
  assert.match(html, /id="resetBtn"/);
  assert.doesNotMatch(html, /id="undoBtn"/);
  assert.match(html, /LONG_PRESS_MS = 520/);
  assert.match(html, /DELETE_ARM_MS = 5000/);
  assert.match(html, /function armDelete/);
  assert.doesNotMatch(html, /startRerecord/);
  assert.match(html, /encodeWav/);
  assert.match(html, /id="rhythmBtn"/);
  assert.match(html, /id="rhythmSheet"/);
  assert.match(html, /BPM_PRESETS\s*=\s*\[80,\s*100,\s*120,\s*140\]/);
  assert.match(html, /COUNT_IN_BARS\s*=\s*1/);
  assert.match(html, /metronomeSound\s*=\s*false/);
  assert.match(html, /function beginCountIn/);
  assert.match(html, /function setMetronomeSound/);
  assert.match(html, /function startMetronome/);
  assert.match(html, /function drawBeatRing/);
  assert.match(html, /scheduleClick/);
  assert.match(html, /levels:\s*\[2,\s*0,\s*0,\s*0\]/);
  assert.match(html, /levels:\s*\[2,\s*0,\s*0,\s*1,\s*0,\s*0\]/);
});

test('Ripple inline script parses', () => {
  assert.doesNotThrow(() => new Function(script));
});

/* ------------------------------------------------------------------ */
/* Fixtures: run top-level functions of the inline script in isolation  */
/* ------------------------------------------------------------------ */

const CLOSING = '\n  }\n';

// Cut one top-level declaration out of the script. Every line of the body
// is indented by at least four spaces, so the first "\n  }\n" closes it.
function slice(name, keyword = 'function') {
  const match = new RegExp(`\\n  (?:async )?${keyword} ${name}[ (]`).exec(script);
  assert.ok(match, `${keyword} ${name} exists`);
  const start = match.index + 1;
  const end = script.indexOf(CLOSING, start);
  assert.ok(end > start, `${name} has a top-level closing brace`);
  const source = script.slice(start, end + CLOSING.length);
  for (const line of source.split('\n').slice(1, -2)) {
    assert.ok(line.trim() === '' || /^ {4}/.test(line), `${name}: bad indent "${line}"`);
  }
  return source;
}

function load(parts, globals = {}) {
  const context = vm.createContext(globals);
  vm.runInContext(parts.join('\n'), context, { filename: 'ripple-slice.js' });
  return context;
}

function fakeTimers() {
  const list = [];
  return {
    list,
    setTimeout(fn, ms) { list.push({ fn, ms, cleared: false }); return list.length; },
    clearTimeout(id) { if (list[id - 1]) list[id - 1].cleared = true; },
    fire(id) {
      const entry = list[id - 1];
      assert.ok(entry && !entry.cleared, `timer ${id} is armed`);
      entry.fn();
    },
  };
}

function fakeAudio() {
  const starts = [];
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    setTargetAtTime() {},
  });
  const node = () => ({
    gain: param(),
    frequency: param(),
    Q: { value: 0 },
    type: '',
    buffer: null,
    onended: null,
    connect() {},
    disconnect() {},
    start(when) { starts.push({ when, at: ac.currentTime }); },
    stop() {},
  });
  const ac = {
    currentTime: 0,
    sampleRate: 48000,
    state: 'running',
    createOscillator: node,
    createGain: node,
    createBiquadFilter: node,
    createBufferSource: node,
  };
  return { ac, starts };
}

function metronomeRig() {
  const audio = fakeAudio();
  const state = { interval: 0, tick: null };
  const context = load(
    [slice('clamp'), slice('scheduleClick'), slice('stopMetronome'), slice('startMetronome')],
    {
      ac: audio.ac,
      metronome: null,
      clickNoise: null,
      window: {
        setInterval(fn, ms) { state.interval = ms; state.tick = fn; return 1; },
        clearInterval() {},
        setTimeout() { return 1; },
      },
    },
  );
  return {
    ac: audio.ac,
    starts: audio.starts,
    context,
    get interval() { return state.interval; },
    get tick() { return state.tick; },
  };
}

const grid = (beats) => ({
  recordStart: 10,
  offset: 0,
  beat: 0.5,
  beats,
  levels: new Array(beats).fill(0),
});

// A class declaration is a lexical binding: export it for the test.
const RECORDER = () => load(
  [slice('Recorder', 'class'), 'globalThis.Recorder = Recorder;'],
  { ...fakeTimers(), WORKLET_SOURCE: '' },
);

function workletRecorder(context) {
  const port = {
    messages: [],
    postMessage(message) { this.messages.push(message); },
  };
  const recorder = new context.Recorder({ sampleRate: 48000, currentTime: 1 }, null);
  recorder.mode = 'worklet';
  recorder.node = { port };
  return { recorder, port };
}

/* ------------------------------------------------------------------ */
/* Structure                                                           */
/* ------------------------------------------------------------------ */

test('audio boots in order: microphone, context, resume', () => {
  const boot = slice('ensureAudio');
  const microphone = boot.indexOf('await navigator.mediaDevices.getUserMedia(');
  const context = boot.indexOf('new AudioCtor(');
  const resume = boot.indexOf('await context.resume()');
  assert.ok(microphone > 0 && context > microphone && resume > context);
  assert.equal((boot.match(/new AudioCtor\(/g) || []).length, 1);
  assert.ok(boot.indexOf('ac = context;') > resume);
});

test('the top bar holds exactly four buttons', () => {
  const header = html.match(/<header[\s\S]*?<\/header>/)[0];
  assert.deepEqual(
    [...header.matchAll(/<button[^>]*\bid="([^"]+)"/g)].map((m) => m[1]),
    ['rhythmBtn', 'monitorBtn', 'exportBtn', 'resetBtn'],
  );
});

test('meters and recording limits', () => {
  assert.match(script, /beats: 3, levels: \[2, 0, 0\]/);
  assert.match(script, /const MIN_FIRST = 0\.6;/);
  assert.match(script, /const MIN_OVERDUB = 0\.12;/);
  assert.match(script, /const MAX_SECONDS = 30;/);
});

/* ------------------------------------------------------------------ */
/* Regressions for the fixes                                           */
/* ------------------------------------------------------------------ */

test('center keydown ignores held keys', () => {
  const start = script.indexOf("ui.center.addEventListener('keydown'");
  const handler = script.slice(start, script.indexOf("ui.center.addEventListener('click'", start));
  assert.match(handler, /event\.preventDefault\(\);[\s\S]*if \(event\.repeat\) return;\s*act\(\);/);
});

test('debug state exposes starting and recorderMode', () => {
  const state = script.slice(script.indexOf('get state()'), script.indexOf('mute: toggleMute'));
  assert.match(state, /\n {8}starting,\n/);
  assert.match(state, /recorderMode: recorder \? recorder\.mode : null,/);
});

test('microphone loss clears the session', () => {
  assert.match(script, /function handleMicEnded\(/);
  assert.equal((script.match(/track\.onended = handleMicEnded;/g) || []).length, 1);
  assert.match(script, /ac\.close\(\)\.catch\(\(\) => \{\}\);/);
  const handler = slice('handleMicEnded');
  assert.ok(handler.indexOf('discardTake();') < handler.indexOf('ac.close()'));
  assert.match(handler, /audioError = \{ main: '麦克风已断开'/);
  assert.match(handler, /setMode\('idle'\);/);
  for (const name of ['stopFirst', 'stopOverdub']) {
    const source = slice(name);
    const stop = source.indexOf('await recorder.stop();');
    const extract = source.indexOf('recorder.extract(');
    const guard = source.indexOf('if (!ac) {', stop);
    assert.ok(stop < guard && guard < extract, `${name} guards a closed context`);
  }
  assert.equal((slice('act').match(/if \(!ac\) return;/g) || []).length, 2);
});

test('metronome lookahead adapts to elapsed time and is capped at one bar', () => {
  const source = slice('startMetronome');
  assert.match(source, /lastAt: ac\.currentTime,/);
  assert.match(source, /Math\.min\(metronome\.beat \* metronome\.beats, 0\.16 \+ elapsed\)/);
  assert.match(source, /if \(when >= now - 0\.02\)/);
  assert.doesNotMatch(source, /ac\.currentTime \+ 0\.16/);
});

/* ------------------------------------------------------------------ */
/* Pure functions                                                      */
/* ------------------------------------------------------------------ */

test('encodeWav writes a 16-bit PCM RIFF/WAVE header', () => {
  const { encodeWav } = load([slice('encodeWav')]);
  const wav = encodeWav([new Float32Array(3)], 48000);
  const view = new DataView(wav);
  const ascii = (offset, length) => String.fromCharCode(...new Uint8Array(wav, offset, length));
  assert.equal(ascii(0, 4), 'RIFF');
  assert.equal(view.getUint32(4, true), 42);
  assert.equal(ascii(8, 4), 'WAVE');
  assert.equal(ascii(12, 4), 'fmt ');
  assert.equal(view.getUint32(16, true), 16);
  assert.equal(view.getUint16(20, true), 1);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 48000);
  assert.equal(view.getUint32(28, true), 96000);
  assert.equal(view.getUint16(32, true), 2);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(ascii(36, 4), 'data');
  assert.equal(view.getUint32(40, true), 6);
  assert.equal(wav.byteLength, 50);
});

test('encodeWav clamps, quantises and interleaves channels', () => {
  const { encodeWav } = load([slice('encodeWav')]);
  const mono = new DataView(encodeWav([Float32Array.of(0, 0.5, -0.5, 1, -1, 2, -2)], 44100));
  assert.deepEqual(
    Array.from({ length: 7 }, (_, i) => mono.getInt16(44 + i * 2, true)),
    [0, 16383, -16384, 32767, -32768, 32767, -32768],
  );
  const stereo = new DataView(encodeWav([Float32Array.of(1, 0), Float32Array.of(0, 1)], 44100));
  assert.deepEqual(
    Array.from({ length: 4 }, (_, i) => stereo.getInt16(44 + i * 2, true)),
    [32767, 0, 0, 32767],
  );
});

test('formatElapsed rounds tenths and clamps to 30 seconds', () => {
  const { formatElapsed } = load([slice('formatElapsed')], { MAX_SECONDS: 30 });
  assert.deepEqual(
    [0, 5, 12.5, 29.96, 30, 2.3, 1.1, -3].map(formatElapsed),
    ['00:00.0', '00:05.0', '00:12.5', '00:30.0', '00:30.0', '00:02.3', '00:01.1', '00:00.0'],
  );
});

test('phaseAt wraps and returns 0 without a loop', () => {
  const context = load([slice('phaseAt')], { loopLen: 4, epoch: 1 });
  assert.deepEqual([1, 3, 5, 0, -3].map(context.phaseAt), [0, 0.5, 0, 0.75, 0]);
  context.loopLen = 0;
  assert.equal(context.phaseAt(3), 0);
});

test('rgba only expands hex colours', () => {
  const { rgba } = load([slice('rgba')]);
  assert.equal(rgba('#ff6f5b', 0.2), 'rgba(255, 111, 91, 0.2)');
});

test('fadeEdges fades both ends and never crosses the middle', () => {
  const { fadeEdges } = load([slice('fadeEdges')]);
  const long = new Float32Array(10).fill(1);
  fadeEdges(long, 1000, 4);
  assert.deepEqual(Array.from(long), [0, 0.25, 0.5, 0.75, 1, 1, 0.75, 0.5, 0.25, 0]);
  const short = new Float32Array(4).fill(1);
  fadeEdges(short, 48000, 100);
  assert.deepEqual(Array.from(short), [0, 0.5, 0.5, 0]);
});

test('computePeaks normalises by the loudest block', () => {
  const { computePeaks } = load([slice('computePeaks')]);
  const data = new Float32Array(1000);
  data[50] = 0.5;
  data[150] = -0.25;
  data[999] = 1;
  const peaks = computePeaks({ getChannelData: () => data }, 10);
  assert.deepEqual(Array.from(peaks).map((v) => +v.toFixed(3)), [0.5, 0.25, 0, 0, 0, 0, 0, 0, 0, 1]);
  const silence = computePeaks({ getChannelData: () => new Float32Array(1000) }, 10);
  assert.ok(Array.from(silence).every((v) => v === 0));
});

test('nextColor picks the first unused colour', () => {
  const context = load([slice('nextColor')], { layers: [], COLORS: ['#a', '#b', '#c'] });
  assert.equal(context.nextColor(), '#a');
  context.layers = [{ color: '#a' }, { color: '#b' }];
  assert.equal(context.nextColor(), '#c');
  context.layers = [{ color: '#a' }, { color: '#b' }, { color: '#c' }];
  assert.equal(context.nextColor(), '#a');
});

test('tempoLocked covers every busy state', () => {
  const context = load([slice('tempoLocked')], { starting: false, mode: 'idle', pendingDelete: null });
  assert.equal(context.tempoLocked(), false);
  for (const mode of ['counting', 'recording', 'overdubbing', 'processing']) {
    context.mode = mode;
    assert.equal(context.tempoLocked(), true, mode);
  }
  context.mode = 'playing';
  context.pendingDelete = { index: 0 };
  assert.equal(context.tempoLocked(), true);
  context.pendingDelete = null;
  context.starting = true;
  assert.equal(context.tempoLocked(), true);
  context.starting = false;
  assert.equal(context.tempoLocked(), false);
});

test('visualBeatGrid follows the state and the meter', () => {
  const meters = /  const METERS = \[[\s\S]*?\];/.exec(script)[0];
  const context = load(
    [meters, slice('visualBeatGrid'), slice('visualBeat')],
    {
      mode: 'idle',
      countIn: null,
      record: null,
      epoch: 0,
      loopLen: 0,
      meterIndex: 0,
      bpm: 120,
      ac: { currentTime: 0 },
    },
  );
  for (const mode of ['idle', 'processing']) {
    context.mode = mode;
    assert.equal(context.visualBeatGrid(), null, mode);
    assert.equal(context.visualBeat(), null, mode);
  }
  context.mode = 'playing';
  context.epoch = 10;
  context.loopLen = 2;
  assert.deepEqual(
    [0, 1, 2].map((i) => { context.meterIndex = i; return context.visualBeatGrid().beats; }),
    [4, 3, 6],
  );
  context.meterIndex = 1;
  context.ac = { currentTime: 10.75 };
  const beat = context.visualBeat();
  assert.deepEqual([beat.grid.anchor, beat.index, beat.level, beat.progress], [10, 1, 0, 0.5]);
  context.mode = 'counting';
  context.countIn = { start: 20, offset: 2, beat: 0.5, beats: 4, levels: [2, 0, 0, 0] };
  assert.equal(context.visualBeatGrid().anchor, 20);
  context.mode = 'overdubbing';
  context.record = { start: 30, offset: 1, beat: 0.5, beats: 4, levels: [2, 0, 0, 0] };
  assert.equal(context.visualBeatGrid().anchor, 30);
  context.ac = null;
  assert.equal(context.visualBeat(), null);
});

/* ------------------------------------------------------------------ */
/* Metronome scheduler                                                 */
/* ------------------------------------------------------------------ */

test('metronome: 40ms ticks schedule evenly spaced beats, never in the past', () => {
  const rig = metronomeRig();
  rig.ac.currentTime = 10;
  rig.context.startMetronome(grid(4), {});
  assert.equal(rig.interval, 40);
  for (let i = 1; i <= 100; i += 1) {
    rig.ac.currentTime = (10000 + i * 40) / 1000;
    rig.tick();
  }
  assert.deepEqual(rig.starts.map((s) => s.when), [10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14]);
  for (const { when, at } of rig.starts) {
    assert.ok(when > at, `beat ${when} is scheduled ahead of ${at}`);
    assert.ok(when - at <= 0.2 + 1e-9, `beat ${when} is at most 200ms ahead of ${at}`);
  }
});

test('metronome: throttled ticks still queue future beats and skip past ones', () => {
  const rig = metronomeRig();
  rig.ac.currentTime = 10;
  rig.context.startMetronome(grid(4), {});
  for (let i = 1; i <= 6; i += 1) {
    rig.ac.currentTime = 10 + i * 1.05;
    rig.tick();
  }
  assert.deepEqual(
    rig.starts.map((s) => s.when),
    [11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5, 16, 16.5, 17, 17.5],
  );
  for (const { when, at } of rig.starts) assert.ok(when >= at - 0.02);
});

test('metronome: lookahead never exceeds one bar', () => {
  const rig = metronomeRig();
  rig.ac.currentTime = 10;
  rig.context.startMetronome(grid(3), {});
  rig.ac.currentTime = 25;
  rig.tick();
  assert.deepEqual(rig.starts.map((s) => s.when), [25, 25.5, 26]);
});

/* ------------------------------------------------------------------ */
/* Recorder                                                            */
/* ------------------------------------------------------------------ */

test('Recorder.stop() clears its own promise once the worklet confirms', async () => {
  const { recorder, port } = workletRecorder(RECORDER());
  recorder.start();
  const stopping = recorder.stop();
  assert.deepEqual(port.messages.map((m) => m.type), ['start', 'stop']);
  recorder.onMessage({ type: 'stopped' });
  await stopping;
  assert.equal(recorder.stopped, null);
  assert.equal(recorder.resolveStopped, null);
});

test('Recorder.stop() keeps the promise created by a later start()', async () => {
  const context = RECORDER();
  const { recorder, port } = workletRecorder(context);
  recorder.start();
  const firstStop = recorder.stop();
  recorder.start();
  const { stopped, resolveStopped } = recorder;
  context.fire(1);
  await firstStop;
  assert.equal(recorder.stopped, stopped);
  assert.equal(recorder.resolveStopped, resolveStopped);
  assert.deepEqual(port.messages.map((m) => m.type), ['start', 'stop', 'start']);
});

test('Recorder.extract() slices chunks and releases them', () => {
  const context = RECORDER();
  const recorder = new context.Recorder({ sampleRate: 1000 }, null);
  recorder.chunks = [
    { frame: 1000, data: Float32Array.of(1, 2, 3, 4) },
    { frame: 1004, data: Float32Array.of(5, 6, 7, 8) },
  ];
  const samples = recorder.extract(1.002, 1.007);
  assert.deepEqual(Array.from(samples), [3, 4, 5, 6, 7]);
  assert.equal(recorder.chunks.length, 0);
  assert.deepEqual(Array.from(samples), [3, 4, 5, 6, 7]);
});

test('ScriptProcessor fallback stamps playbackTime and keeps the tail', async () => {
  const context = RECORDER();
  const processor = { connect() {}, onaudioprocess: null };
  const ac = {
    audioWorklet: undefined,
    sampleRate: 48000,
    currentTime: 5,
    destination: {},
    createScriptProcessor: () => processor,
    createGain: () => ({ gain: {}, connect() {} }),
  };
  const recorder = new context.Recorder(ac, { connect() {} });
  await recorder.init();
  assert.equal(recorder.mode, 'script');
  recorder.start();
  const block = (playbackTime) => ({
    playbackTime,
    inputBuffer: { getChannelData: () => new Float32Array(4096).fill(0.25) },
  });
  processor.onaudioprocess(block(5));
  assert.equal(recorder.chunks.at(-1).frame, 5 * 48000 - 4096);
  ac.currentTime = 5.073;
  processor.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(4096) } });
  assert.equal(recorder.chunks.at(-1).frame, Math.round(5.073 * 48000) - 4096);

  const before = recorder.chunks.length;
  let done = false;
  const stopping = recorder.stop().then(() => { done = true; });
  await Promise.resolve();
  assert.equal(recorder.capturing, false);
  assert.equal(done, false);
  processor.onaudioprocess(block(5.116));
  await stopping;
  assert.equal(recorder.chunks.length, before + 1);

  recorder.start();
  const count = recorder.chunks.length;
  const second = recorder.stop();
  context.fire(2);
  await second;
  assert.equal(recorder.chunks.length, count);
});

test('stopLayerSource() disconnects the layer gain after the fade', () => {
  let run = null;
  const context = load(
    [slice('stopLayerSource')],
    { window: { setTimeout(fn, ms) { assert.equal(ms, 80); run = fn; } } },
  );
  const calls = [];
  const layer = {
    gain: { disconnect() { calls.push('gain'); } },
    source: { stop() { calls.push('stop'); }, disconnect() { calls.push('source'); } },
  };
  context.stopLayerSource(layer, 80);
  assert.equal(layer.source, null);
  assert.deepEqual(calls, []);
  run();
  assert.deepEqual(calls, ['stop', 'source', 'gain']);
});
