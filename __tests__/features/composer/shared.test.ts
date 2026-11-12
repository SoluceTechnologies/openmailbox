import { clearSharedPayloads, getResolvedSharedPayloadsAsync, getSharedPayloads } from 'expo-sharing';

import { readSharedContent, sharedText } from '@/features/composer/shared';

jest.mock('expo-sharing', () => ({
  getResolvedSharedPayloadsAsync: jest.fn(),
  getSharedPayloads: jest.fn(),
  clearSharedPayloads: jest.fn(),
}));

const mockFiles = new Map<string, number>();
jest.mock('expo-file-system', () => {
  const join = (...parts: ({ uri: string } | string)[]) => parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
  return {
    Paths: { cache: { uri: 'file:///cache' } },
    Directory: class {
      uri: string;
      constructor(...parts: ({ uri: string } | string)[]) {
        this.uri = join(...parts);
      }
      create() {}
    },
    File: class {
      uri: string;
      constructor(...parts: ({ uri: string } | string)[]) {
        this.uri = join(...parts);
      }
      get name() {
        return decodeURIComponent(this.uri.slice(this.uri.lastIndexOf('/') + 1));
      }
      get exists() {
        return mockFiles.has(this.uri);
      }
      get size() {
        return mockFiles.get(this.uri) ?? 0;
      }
      delete() {
        mockFiles.delete(this.uri);
      }
      async copy(target: { uri: string }) {
        if (!mockFiles.has(this.uri)) throw new Error('missing');
        mockFiles.set(target.uri, mockFiles.get(this.uri)!);
      }
    },
  };
});

const resolved = getResolvedSharedPayloadsAsync as jest.Mock;
const raw = getSharedPayloads as jest.Mock;

describe('shared content', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFiles.clear();
    jest.spyOn(Date, 'now').mockReturnValue(1);
  });

  it('joins shared texts and links, without the files', () => {
    expect(
      sharedText([
        { shareType: 'text', value: ' Look at this ', mimeType: 'text/plain' },
        { shareType: 'image', value: 'file:///photo.jpg', mimeType: 'image/jpeg' },
        { shareType: 'url', value: 'https://example.com', mimeType: 'text/plain' },
        { shareType: 'text', value: '  ', mimeType: 'text/plain' },
      ]),
    ).toBe('Look at this\n\nhttps://example.com');
  });

  it('copies shared files into the cache under their original name, then forgets the share', async () => {
    mockFiles.set('content://media/42', 1_200);
    resolved.mockResolvedValue([
      { shareType: 'url', value: 'https://example.com', contentType: 'website', contentUri: 'https://example.com', contentMimeType: 'text/html', originalName: null, contentSize: null },
      { shareType: 'image', value: 'content://media/42', contentType: 'image', contentUri: 'content://media/42', contentMimeType: 'image/jpeg', originalName: 'IMG_0042.jpg', contentSize: 1_200 },
    ]);
    expect(await readSharedContent()).toEqual({
      text: 'https://example.com',
      attachments: [{ path: '/cache/shared/1/0/IMG_0042.jpg', filename: 'IMG_0042.jpg', mimeType: 'image/jpeg', size: 1_200 }],
      failed: false,
    });
    expect(clearSharedPayloads).toHaveBeenCalled();
  });

  it('falls back to the raw share when it cannot be resolved, and reports the files it could not copy', async () => {
    mockFiles.set('file:///group/Devis%20sign%C3%A9.pdf', 52_000);
    resolved.mockRejectedValue(new Error('offline'));
    raw.mockReturnValue([
      { shareType: 'file', value: 'file:///group/Devis%20sign%C3%A9.pdf', mimeType: 'application/pdf' },
      { shareType: 'file', value: 'file:///group/gone.pdf', mimeType: 'application/pdf' },
    ]);
    expect(await readSharedContent()).toEqual({
      text: '',
      attachments: [
        { path: '/cache/shared/1/0/Devis signé.pdf', filename: 'Devis signé.pdf', mimeType: 'application/pdf', size: 52_000 },
      ],
      failed: true,
    });
  });
});
