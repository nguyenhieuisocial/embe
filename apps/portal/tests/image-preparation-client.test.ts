import { afterEach, expect, it, vi } from 'vitest';
import { prepareImageForUpload } from '../src/lib/image-preparation-client';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function decodedImage(width: number, height: number) {
  vi.stubGlobal('Image', class {
    naturalWidth = width; naturalHeight = height;
    onload?: () => void;
    set src(_value: string) { queueMicrotask(() => this.onload?.()); }
  });
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:test', revokeObjectURL: vi.fn() });
}
const options = { filename: 'converted.jpg', maxBytes: 15_000_000, maxDimension: 3200, quality: .94 };

it('keeps eligible medical image bytes and filename unchanged', async () => {
  decodedImage(1800, 5900);
  const canvas = vi.spyOn(document, 'createElement');
  const original = new File(['original'], 'phieu-thu.png', { type: 'image/png' });
  expect(await prepareImageForUpload(original, { ...options, preserveOriginal: true })).toBe(original);
  expect(canvas).not.toHaveBeenCalled();
});

it.each([{ width: 8000, height: 6000, preserve: true }, { width: 1200, height: 1800, preserve: false }])(
  'still uses bounded conversion for oversized images or other upload flows ($width × $height)', async ({ width, height, preserve }) => {
    decodedImage(width, height);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['converted'], { type: 'image/jpeg' })));
    const original = new File(['original'], 'mau.png', { type: 'image/png' });
    const result = await prepareImageForUpload(original, { ...options, preserveOriginal: preserve });
    expect(result).not.toBe(original);
    expect(result.type).toBe('image/jpeg');
  });
