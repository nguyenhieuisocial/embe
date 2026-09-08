import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { recognizeDocument } from '../document_ocr.mjs';

test('rejects URLs, non-JPEG and excessive input before loading models', async () => {
  for (const value of ['https://private.invalid', Buffer.from('PRIVATE_DOCUMENT'), Buffer.alloc(15_000_001)]) {
    await assert.rejects(recognizeDocument(value), /invalid_ocr_image/);
  }
});
test('stdin bridge returns only a redacted failure, never private input', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../document_ocr.mjs', import.meta.url))], {
    input: 'PRIVATE_DOCUMENT', encoding: 'utf8', timeout: 10000, windowsHide: true
  });
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout), { error: 'ocr_unavailable' });
  assert.equal(result.stderr, '');
});
