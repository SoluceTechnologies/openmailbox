import { fetch } from 'expo/fetch';
import { Directory, File, Paths } from 'expo-file-system';

import { storage } from '@/storage';
import { sha256Hex } from '@/utils/sha256';

import { avatarSources } from './avatarSources';

const RECHECK_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 512 * 1024;

interface Entry {
  uri: string | null;
  checkedAt: number;
}

const resolved = new Map<string, Entry>();
const pending = new Map<string, Promise<string | null>>();

const normalize = (email: string) => email.trim().toLowerCase();
const storageKey = (address: string) => `avatar:${address}`;

/**
 * The saved picture of an address, null when it has none, undefined when it has not been looked up
 * for a month or its picture was removed from the cache directory.
 */
export function cachedAvatar(email: string): string | null | undefined {
  const address = normalize(email);
  let entry = resolved.get(address);
  if (!entry) {
    const saved = storage.getString(storageKey(address));
    if (!saved) return undefined;
    entry = JSON.parse(saved) as Entry;
    if (entry.uri && !new File(entry.uri).exists) return undefined;
    resolved.set(address, entry);
  }
  return Date.now() - entry.checkedAt > RECHECK_AFTER_MS ? undefined : entry.uri;
}

/** Looks the address up once, however many rows ask for it at the same time. */
export function loadAvatar(email: string): Promise<string | null> {
  const address = normalize(email);
  const cached = cachedAvatar(address);
  if (cached !== undefined) return Promise.resolve(cached);
  let request = pending.get(address);
  if (!request) {
    request = lookUp(address).finally(() => pending.delete(address));
    pending.set(address, request);
  }
  return request;
}

async function lookUp(address: string): Promise<string | null> {
  let uri: string | null = null;
  try {
    for (const source of avatarSources(address)) {
      const bytes = await download(source);
      if (bytes) {
        uri = save(address, bytes);
        break;
      }
    }
  } catch {
    return null;
  }
  const entry = { uri, checkedAt: Date.now() };
  resolved.set(address, entry);
  storage.set(storageKey(address), JSON.stringify(entry));
  return uri;
}

/** The picture at `url`, or null when the server has none. Throws when the server cannot be reached. */
async function download(url: string): Promise<Uint8Array | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) return null;
    const bytes = await response.bytes();
    return bytes.length > 0 && bytes.length <= MAX_BYTES ? bytes : null;
  } finally {
    clearTimeout(timeout);
  }
}

function save(address: string, bytes: Uint8Array): string {
  const directory = new Directory(Paths.cache, 'avatars');
  if (!directory.exists) directory.create({ intermediates: true });
  const file = new File(directory, sha256Hex(address));
  if (!file.exists) file.create();
  file.write(bytes);
  return file.uri;
}
