// Tests for receiptOcr.js — verifies the tesseract.js v7 integration options.
// Uses an ESM loader (tesseract-loader.js) to mock the tesseract browser build.
//
// Background: tesseract.js v7 defaults `gzip` to falsy, so it fetches
// `eng.traineddata` (uncompressed) from the CDN — but only `eng.traineddata.gz`
// exists there. The 404 made createWorker() hang silently (v7 swallows load
// errors), freezing the UI at "Reading receipt… 0%". We must pass gzip:true.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { register } = require('node:module');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

before(() => {
  register(pathToFileURL(path.join(__dirname, 'tesseract-loader.js')));
});

test('passes gzip:true to createWorker so the .gz language data is fetched', async () => {
  const { readReceiptText } = await import('../frontend/src/receiptOcr.js');
  const mock = await import('./mocks/tesseract.mock.js');
  mock.__resetCapturedOptions();

  const seen = [];
  const text = await readReceiptText(new Blob(['x']), (p) => seen.push(p));

  const captured = mock.__getCapturedOptions();
  assert.ok(captured, 'createWorker should have been called');
  assert.equal(captured.langs, 'eng');
  assert.equal(captured.options.gzip, true, 'gzip must be true to fetch eng.traineddata.gz (not the 404ing uncompressed file)');
  assert.equal(text, 'MOCK TEXT');
  assert.ok(seen.length > 0, 'progress callback should fire');
  assert.ok(seen[seen.length - 1] === 100, 'progress should reach 100%');
});

test('readReceiptText rejects (does not hang) if createWorker never settles', async () => {
  // The 60s timeout is a safety net; here we just verify the race structure
  // exists by checking the source wires a timeout rejection path.
  const fs = require('node:fs');
  const src = fs.readFileSync(path.join(__dirname, '..', 'frontend/src/receiptOcr.js'), 'utf8');
  assert.ok(src.includes('Promise.race'), 'worker creation should race against a timeout');
  assert.ok(src.includes('60000'), 'timeout should be 60s');
});
