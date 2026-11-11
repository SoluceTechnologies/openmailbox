import { fetch } from 'expo/fetch';
import { Directory, File, Paths } from 'expo-file-system';

import { storage } from '@/storage';
import { organizationDomain } from '@/utils/addresses';
import { sha256Hex } from '@/utils/sha256';

import { BIMI_SOURCE, avatarSources } from './avatarSources';

const RECHECK_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const OFFLINE_RETRY_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 512 * 1024;
/** DNS over HTTPS: React Native has no DNS lookup of its own. */
const DNS_RESOLVER = 'https://cloudflare-dns.com/dns-query';
const TXT = 16;

interface Entry {
  uri: string | null;
  expiresAt: number;
}

const resolved = new Map<string, Entry>();
const pending = new Map<string, Promise<string | null>>();

const normalize = (email: string) => email.trim().toLowerCase();
// Version 2 added BIMI logos: pictures found before are looked up again rather than kept a month.
const storageKey = (address: string) => `avatar2:${address}`;

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
  return Date.now() > entry.expiresAt ? undefined : entry.uri;
}

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
  let reachedNetwork = false;
  for (const source of avatarSources(address)) {
    let bytes: Uint8Array | null = null;
    const bimi = source.startsWith(BIMI_SOURCE);
    try {
      bytes = bimi ? await bimiLogo(source.slice(BIMI_SOURCE.length)) : await download(source);
      reachedNetwork = true;
    } catch {
      if (!reachedNetwork) {
        resolved.set(address, { uri: null, expiresAt: Date.now() + OFFLINE_RETRY_MS });
        return null;
      }
    }
    if (bytes) return remember(address, save(address, bytes, bimi ? '.svg' : ''));
  }
  return remember(address, null);
}

function remember(address: string, uri: string | null): string | null {
  const entry = { uri, expiresAt: Date.now() + RECHECK_AFTER_MS };
  resolved.set(address, entry);
  storage.set(storageKey(address), JSON.stringify(entry));
  return uri;
}

/**
 * The logo a brand publishes for its mail: a `default._bimi` TXT record at the sender's domain,
 * else at its organization's, points to an SVG.
 */
async function bimiLogo(domain: string): Promise<Uint8Array | null> {
  const organization = organizationDomain(domain);
  const location = (await bimiLocation(domain)) ?? (organization !== domain ? await bimiLocation(organization) : null);
  return location ? download(location) : null;
}

async function bimiLocation(domain: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${DNS_RESOLVER}?name=default._bimi.${encodeURIComponent(domain)}&type=TXT`, {
      headers: { accept: 'application/dns-json' },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const { Answer = [] } = (await response.json()) as { Answer?: { type: number; data: string }[] };
    return bimiLogoLocation(Answer.filter((entry) => entry.type === TXT).map((entry) => entry.data));
  } finally {
    clearTimeout(timeout);
  }
}

/** The `l=` of a BIMI record, from TXT data whose strings are each quoted: only an HTTPS SVG. */
export function bimiLogoLocation(records: string[]): string | null {
  for (const data of records) {
    const text = (data.match(/"((?:[^"\\]|\\.)*)"/g) ?? [data]).map((part) => part.replace(/^"|"$/g, '')).join('');
    const tags = new Map(
      text
        .split(';')
        .map((tag) => tag.trim().split('='))
        .filter(([name]) => name)
        .map(([name, ...value]) => [name.trim().toLowerCase(), value.join('=').trim()] as const),
    );
    const location = tags.get('l');
    if (tags.get('v')?.toUpperCase() === 'BIMI1' && location?.startsWith('https://')) return location;
  }
  return null;
}

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

/** An `.svg` file holds a BIMI logo, which pictures are drawn from differently. */
function save(address: string, bytes: Uint8Array, extension: string): string {
  const directory = new Directory(Paths.cache, 'avatars');
  if (!directory.exists) directory.create({ intermediates: true });
  const file = new File(directory, `${sha256Hex(address)}${extension}`);
  if (!file.exists) file.create();
  file.write(bytes);
  return file.uri;
}
