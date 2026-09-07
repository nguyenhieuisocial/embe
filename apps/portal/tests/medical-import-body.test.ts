import { describe, expect, it } from 'vitest';
import { memberBody } from '../src/lib/family-members-server';

const request = (length: number) => new Request('https://embe.hieu.asia/api/pregnancy/documents/sample/import', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value: 'x'.repeat(length) }),
});
describe('bounded medical import envelope', () => {
  it('leaves the default body limit unchanged', async () => {
    await expect(memberBody(request(65_536))).rejects.toThrow('too_large');
  });
  it('allows a reviewed transcription plus selected details only in the larger bounded envelope', async () => {
    await expect(memberBody(request(70_000), 96 * 1024)).resolves.toMatchObject({ value: 'x'.repeat(70_000) });
    await expect(memberBody(request(98_304), 96 * 1024)).rejects.toThrow('too_large');
    await expect(memberBody(request(1), Infinity)).rejects.toThrow('invalid_limit');
  });
});
