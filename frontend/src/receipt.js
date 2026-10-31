// Client-side receipt compression (browser only — not imported by node tests).
//
// Phone camera photos are several MB; downscale to max 1600px on the long
// edge and export as JPEG quality 0.7 before upload. Keeps uploads fast
// and MongoDB documents small.

const MAX_EDGE = 1600;

export async function compressReceiptImage(file) {
  let bitmap = null;
  let objectUrl = null;
  try {
    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(file);
    } else {
      // Fallback for older browsers: decode via an <img> element.
      objectUrl = URL.createObjectURL(file);
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = objectUrl;
      });
      bitmap = img;
    }
    const width = bitmap.width;
    const height = bitmap.height;
    const scale = Math.max(width, height) > MAX_EDGE ? MAX_EDGE / Math.max(width, height) : 1;
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Could not compress image'))),
        'image/jpeg',
        0.7
      );
    });
  } finally {
    if (bitmap && typeof bitmap.close === 'function') bitmap.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
