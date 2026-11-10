import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import type { Attachment, OutgoingAttachment } from '@openmailbox/mail-core';

import { attachmentsDirectory, mailCore } from '@/core/mailCore';

export const MAX_ATTACHMENTS_BYTES = 26_214_400;

export type ComposerAttachment = OutgoingAttachment & { size: number };

function pathOf(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, ''));
}

export function totalSize(attachments: ComposerAttachment[]): number {
  return attachments.reduce((total, attachment) => total + attachment.size, 0);
}

export function canAdd(current: ComposerAttachment[], added: ComposerAttachment[]): boolean {
  return totalSize(current) + totalSize(added) <= MAX_ATTACHMENTS_BYTES;
}

export async function pickAttachments(source: 'photos' | 'files'): Promise<ComposerAttachment[]> {
  if (source === 'files') {
    const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return [];
    return result.assets.map((asset) => ({
      path: pathOf(asset.uri),
      filename: asset.name,
      mimeType: asset.mimeType ?? 'application/octet-stream',
      size: asset.size ?? 0,
    }));
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    allowsMultipleSelection: true,
    quality: 1,
  });
  if (result.canceled) return [];
  return result.assets.map((asset) => ({
    path: pathOf(asset.uri),
    filename: asset.fileName ?? asset.uri.slice(asset.uri.lastIndexOf('/') + 1),
    mimeType: asset.mimeType ?? 'application/octet-stream',
    size: asset.fileSize ?? 0,
  }));
}

export function forwardedAttachments(emailId: string, attachments: Attachment[]): Promise<ComposerAttachment[]> {
  return Promise.all(
    attachments.map(async (attachment) => ({
      path: await mailCore().saveAttachment(emailId, attachment.index, attachmentsDirectory()),
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
    })),
  );
}
