// Mock for 'tesseract.js/dist/tesseract.min.js' — captures createWorker options.
let capturedOptions = null;

const mockWorker = {
  recognize: async () => ({ data: { text: 'MOCK TEXT' } }),
  terminate: async () => {},
};

const Tesseract = {
  createWorker: async (langs, oem, options) => {
    capturedOptions = { langs, oem, options };
    // Simulate the logger firing like the real worker does during load.
    if (options && typeof options.logger === 'function') {
      options.logger({ status: 'loading tesseract core', progress: 0 });
      options.logger({ status: 'recognizing text', progress: 1 });
    }
    return mockWorker;
  },
};

export default Tesseract;
export function __getCapturedOptions() { return capturedOptions; }
export function __resetCapturedOptions() { capturedOptions = null; }
