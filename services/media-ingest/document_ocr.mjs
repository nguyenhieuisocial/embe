// Private stdin -> stdout bridge. Models and WASM are installed locally by npm ci.
// Never accept URLs, file paths, language names or commands from the document.
import { createWorker, OEM, PSM } from 'tesseract.js';
import { createRequire } from 'node:module';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
export async function recognizeDocument(image) {
  if (!Buffer.isBuffer(image) || !image.length || image.length > 15_000_000
    || !(image[0] === 0xff && image[1] === 0xd8)) throw new Error('invalid_ocr_image');
  // v7's custom language object initializer treats bytes as language names.
  // Stage only bundled public model files in one private temporary directory;
  // an absolute local langPath prevents any CDN fallback. No document files.
  const models = await mkdtemp(join(tmpdir(), 'embe-ocr-models-'));
  let worker;
  try {
    await Promise.all(['vie', 'eng'].map(code => copyFile(
      join(dirname(require.resolve(`@tesseract.js-data/${code}`)), '4.0.0_best_int', `${code}.traineddata.gz`),
      join(models, `${code}.traineddata.gz`))));
    worker = await createWorker('vie+eng', OEM.LSTM_ONLY, {
      langPath: models, cacheMethod: 'none', logger: () => {}, errorHandler: () => {}
    });
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '1', user_defined_dpi: '300' });
    const { data } = await worker.recognize(image, {}, { text: true });
    const text = data.text.normalize('NFC').replace(/\f/g, '\n').trim();
    if ([...text].length > 48000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) throw new Error('ocr_text_too_large');
    return { text, engine: 'tesseract-vie-eng', lowConfidence: !Number.isFinite(data.confidence) || data.confidence < 75 };
  } finally {
    await worker?.terminate();
    await rm(models, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const chunks = []; let size = 0;
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > 15_000_000) throw new Error('invalid_ocr_image');
      chunks.push(chunk);
    }
    process.stdout.write(JSON.stringify(await recognizeDocument(Buffer.concat(chunks))));
  } catch {
    // Do not print library errors: they can contain fragments of private input.
    process.stdout.write(JSON.stringify({ error: 'ocr_unavailable' }));
    process.exitCode = 1;
  }
}
