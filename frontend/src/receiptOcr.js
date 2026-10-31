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
  const worker = await Tesseract.createWorker('eng', undefined, {
    logger: (m) => {
      if (!onProgress || !m || typeof m.progress !== 'number') return;
      // 'recognizing text' is the long phase; loading phases map to 0-10%.
      const pct = m.status === 'recognizing text'
        ? 10 + Math.round(m.progress * 90)
        : Math.round(m.progress * 10);
      onProgress(Math.max(0, Math.min(100, pct)));
    },
  });
  try {
    const { data } = await worker.recognize(blob);
    return (data && data.text) || '';
  } finally {
    await worker.terminate().catch(() => {});
  }
}
