import { fetchImageAsDataUri } from '@/features/reader/components/HtmlBody';

class FakeFileReader {
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsDataURL(blob: { type: string }) {
    this.result = `data:${blob.type};base64,AAAA`;
    this.onload?.();
  }
}

const respondWith = (type: string, size = 4) => jest.fn().mockResolvedValue({ ok: true, blob: async () => ({ type, size }) });

beforeEach(() => {
  Object.assign(globalThis, { FileReader: FakeFileReader });
});

describe('fetchImageAsDataUri', () => {
  it('fetches the image again without cookies and returns it inline', async () => {
    globalThis.fetch = respondWith('image/png');
    await expect(fetchImageAsDataUri('https://claude.ai/logo.png')).resolves.toBe('data:image/png;base64,AAAA');
    expect(globalThis.fetch).toHaveBeenCalledWith('https://claude.ai/logo.png', { credentials: 'omit' });
  });

  it('refuses what is not an image or is too large', async () => {
    globalThis.fetch = respondWith('text/html');
    await expect(fetchImageAsDataUri('https://example.com/page')).resolves.toBeNull();
    globalThis.fetch = respondWith('image/png', 6 * 1024 * 1024);
    await expect(fetchImageAsDataUri('https://example.com/huge.png')).resolves.toBeNull();
  });

  it('never fetches anything but http(s)', async () => {
    globalThis.fetch = jest.fn();
    await expect(fetchImageAsDataUri('file:///etc/hosts')).resolves.toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
