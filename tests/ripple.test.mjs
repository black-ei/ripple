import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

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
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script, 'inline script is present');
  assert.doesNotThrow(() => new Function(script[1]));
});
