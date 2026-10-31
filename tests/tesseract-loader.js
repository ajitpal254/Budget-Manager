// ESM loader hooks: redirect tesseract.js browser build to our mock.
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const mockPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'mocks/tesseract.mock.js');
const mockUrl = pathToFileURL(mockPath).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'tesseract.js/dist/tesseract.min.js') {
    return { url: mockUrl, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
