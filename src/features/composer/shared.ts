import { Directory, File, Paths } from 'expo-file-system';
import {
  clearSharedPayloads,
  getResolvedSharedPayloadsAsync,
  getSharedPayloads,
  type ResolvedSharePayload,
  type SharePayload,
} from 'expo-sharing';

import { pathOf, type ComposerAttachment } from './attachments';

type Shared = SharePayload & Partial<Pick<ResolvedSharePayload, 'contentUri' | 'contentMimeType' | 'originalName'>>;

export interface SharedContent {
  text: string;
  attachments: ComposerAttachment[];
  failed: boolean;
}

const isText = (payload: SharePayload) => payload.shareType === 'text' || payload.shareType === 'url';

export function sharedText(payloads: SharePayload[]): string {
  return payloads
    .filter(isText)
    .map((payload) => payload.value.trim())
    .filter(Boolean)
    .join('\n\n');
}

async function copy(payload: Shared, directory: Directory): Promise<ComposerAttachment> {
  const source = new File(payload.contentUri ?? payload.value);
  const filename = payload.originalName || source.name;
  directory.create({ intermediates: true, idempotent: true });
  const target = new File(directory, filename);
  if (target.exists) target.delete();
  await source.copy(target);
  return {
    path: pathOf(target.uri),
    filename,
    mimeType: payload.contentMimeType ?? payload.mimeType ?? 'application/octet-stream',
    size: target.size,
  };
}

export async function readSharedContent(): Promise<SharedContent> {
  const payloads: Shared[] = await getResolvedSharedPayloadsAsync().catch(() => getSharedPayloads());
  const directory = new Directory(Paths.cache, 'shared', String(Date.now()));
  const copies = await Promise.allSettled(
    payloads.filter((payload) => !isText(payload)).map((payload, index) => copy(payload, new Directory(directory, String(index)))),
  );
  clearSharedPayloads();
  return {
    text: sharedText(payloads),
    attachments: copies.flatMap((copied) => (copied.status === 'fulfilled' ? [copied.value] : [])),
    failed: copies.some((copied) => copied.status === 'rejected'),
  };
}
