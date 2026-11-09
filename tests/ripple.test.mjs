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
  assert.match(html, /encodeWav/);
});

test('Ripple inline script parses', () => {
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script, 'inline script is present');
  assert.doesNotThrow(() => new Function(script[1]));
});
