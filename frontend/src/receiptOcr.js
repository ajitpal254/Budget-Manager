// Browser-only receipt OCR. tesseract.js is lazy-loaded via dynamic import
// the first time a receipt is read, so the main bundle stays lean.
// NOT imported by node tests (uses browser APIs + the tesseract worker).

/**
 * Run OCR on an image blob and return the recognized text.
 * @param {Blob} blob image to read (already compressed upstream)
 * @param {(pct: number) => void} [onProgress] 0-100 progress callback
 * @returns {Promise<string>} raw OCR text (may be empty)
 * @throws when the OCR engine cannot load or recognize
 */
export async function readReceiptText(blob, onProgress) {
  // NOTE: tesseract.js v7's package "main" points at a Node-only CJS entry,
  // so a bare import('tesseract.js') bundles the wrong code. Import the
  // browser UMD build directly; vite code-splits it into a lazy chunk.
  const mod = await import('tesseract.js/dist/tesseract.min.js');
  const Tesseract = mod && mod.default ? mod.default : mod;
  // NOTE: gzip:true is REQUIRED. tesseract.js v7 defaults gzip to falsy, so
  // it fetches `eng.traineddata` (uncompressed) from the CDN — but only
  // `eng.traineddata.gz` exists there, so the fetch 404s. Worse, v7's
  // createWorker swallows load errors (`.catch(() => {})`), leaving the
  // promise pending forever — the UI hangs at "Reading receipt… 0%".
  // With gzip:true it fetches the real .gz file and gunzips it in-worker.
  //
  // The createWorkerTimeout below is a safety net: if the engine ever hangs
  // again (network stall, blocked CDN), we reject instead of hanging forever
  // so the UI can fall back to manual entry.
  let timeoutId;
  const createWorkerTimeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('OCR engine timed out while loading (60s)')), 60000);
  });
  let worker;
  try {
    worker = await Promise.race([
      Tesseract.createWorker('eng', undefined, {
        gzip: true,
        logger: (m) => {
          if (!onProgress || !m || typeof m.progress !== 'number') return;
          // 'recognizing text' is the long phase; loading phases map to 0-10%.
          const pct = m.status === 'recognizing text'
            ? 10 + Math.round(m.progress * 90)
            : Math.round(m.progress * 10);
          onProgress(Math.max(0, Math.min(100, pct)));
        },
      }),
      createWorkerTimeout,
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
  try {
    const { data } = await worker.recognize(blob);
    return (data && data.text) || '';
  } finally {
    await worker.terminate().catch(() => {});
  }
}
