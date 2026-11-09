import { fetch } from 'expo/fetch';

import { cachedAvatar, loadAvatar } from '@/features/avatars/avatarCache';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));

const mockFiles = new Map<string, Uint8Array>();
jest.mock('expo-file-system', () => {
  const join = (...parts: { uri?: string }[] | string[]) =>
    parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
  return {
    Paths: { cache: { uri: 'file:///cache' } },
    Directory: class {
      uri: string;
      constructor(...parts: string[]) {
        this.uri = join(...parts);
      }
      get exists() {
        return true;
      }
      create() {}
    },
    File: class {
      uri: string;
      constructor(...parts: string[]) {
        this.uri = join(...parts);
      }
      get exists() {
        return mockFiles.has(this.uri);
      }
      create() {
        mockFiles.set(this.uri, new Uint8Array());
      }
      write(bytes: Uint8Array) {
        mockFiles.set(this.uri, bytes);
      }
    },
  };
});

const fetchMock = fetch as jest.Mock;
const ICON = new Uint8Array([0, 0, 1, 0, 1]);

function respond(status: number, contentType = 'image/png', bytes = ICON) {
  return { ok: status >= 200 && status < 300, status, headers: new Headers({ 'content-type': contentType }), bytes: async () => bytes };
}

function serve(routes: Record<string, ReturnType<typeof respond>>) {
  fetchMock.mockImplementation(async (url: string) => routes[Object.keys(routes).find((route) => url.startsWith(route)) ?? ''] ?? respond(404));
}

describe('avatar cache', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    mockFiles.clear();
  });

  afterEach(() => jest.useRealTimers());

  it('saves the first real picture it finds and reuses it', async () => {
    serve({
      'https://gravatar.com/': respond(404),
      'https://lumen.example/apple-touch-icon.png': respond(200, 'text/html; charset=utf-8'),
      'https://lumen.example/favicon.ico': respond(200, 'image/x-icon'),
    });

    const uri = await loadAvatar('Claire.Dubois@lumen.example');

    expect(uri).toMatch(/^file:\/\/\/cache\/avatars\/[0-9a-f]{64}$/);
    expect(mockFiles.get(uri!)).toEqual(ICON);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(cachedAvatar('claire.dubois@lumen.example')).toBe(uri);
    await loadAvatar('claire.dubois@lumen.example');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('remembers for a month that an address has no picture', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-09T10:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
    serve({});

    expect(await loadAvatar('alice@gmail.com')).toBeNull();
    expect(await loadAvatar('alice@gmail.com')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date('2026-12-10T10:00:00Z'));
    expect(cachedAvatar('alice@gmail.com')).toBeUndefined();
  });

  it('waits a few minutes before trying again when offline', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-09T10:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));

    expect(await loadAvatar('bob@gmail.com')).toBeNull();
    expect(cachedAvatar('bob@gmail.com')).toBeNull();

    jest.setSystemTime(new Date('2026-11-09T10:11:00Z'));
    expect(cachedAvatar('bob@gmail.com')).toBeUndefined();
  });

  it('counts a company website that cannot be reached as having no logo', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('https://gravatar.com/')) return respond(404);
      throw new TypeError('Network request failed');
    });

    expect(await loadAvatar('thomas@unreachable.example')).toBeNull();
    expect(await loadAvatar('thomas@unreachable.example')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('looks an address up once while several rows wait for it', async () => {
    serve({ 'https://gravatar.com/': respond(200, 'image/jpeg') });

    const [first, second] = await Promise.all([loadAvatar('carol@gmail.com'), loadAvatar('carol@gmail.com')]);

    expect(first).toBe(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a picture that is far too big for an avatar', async () => {
    serve({ 'https://gravatar.com/': respond(200, 'image/png', new Uint8Array(600 * 1024)) });

    expect(await loadAvatar('dave@gmail.com')).toBeNull();
  });
});
