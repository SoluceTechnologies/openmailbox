import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { router } from 'expo-router';
import type { Attachment } from '@openmailbox/mail-core';

import { attachmentsDirectory, mailCore } from '@/core/mailCore';

import { presentVCard } from './vcard';

export const VIEWABLE_ON_IOS = [
  'application/pdf',
  'image/',
  'video/',
  'audio/',
  'text/',
  'application/json',
  'application/vnd.openxmlformats-officedocument.',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
];

const UNKNOWN_TYPE = 'application/octet-stream';
const CONVERTED_TYPES = ['image/jxl', 'image/tiff'];
const CONVERTED_EXTENSIONS = /\.(jxl|tiff?)$/i;
const EMAIL = /\.eml$/i;
const VCARD_TYPES = ['text/vcard', 'text/x-vcard', 'text/directory'];
const VCARD = /\.vcf$/i;
const FLAG_GRANT_READ_URI_PERMISSION = 1;

function share(uri: string, attachment: Attachment): Promise<void> {
  return Sharing.shareAsync(uri, { mimeType: attachment.mimeType, dialogTitle: attachment.filename });
}

async function readableCopy(path: string, attachment: Attachment): Promise<{ path: string; attachment: Attachment }> {
  if (!CONVERTED_TYPES.includes(attachment.mimeType) && !CONVERTED_EXTENSIONS.test(attachment.filename)) return { path, attachment };
  const png = await mailCore().readableImage(path).catch(() => undefined);
  return png ? { path: png, attachment: { ...attachment, mimeType: 'image/png' } } : { path, attachment };
}

export function isAttachedEmail(attachment: Attachment): boolean {
  return attachment.mimeType === 'message/rfc822' || EMAIL.test(attachment.filename);
}

export function fileUri(path: string): string {
  return `file://${path.split('/').map(encodeURIComponent).join('/')}`;
}

export async function openAttachment(emailId: string, original: Attachment): Promise<void> {
  return openSaved(await mailCore().saveAttachment(emailId, original.index, attachmentsDirectory()), original);
}

export async function openAttachmentOfFile(file: string, original: Attachment): Promise<void> {
  return openSaved(await mailCore().saveAttachmentFromFile(file, original.index, attachmentsDirectory()), original);
}

async function openSaved(saved: string, original: Attachment): Promise<void> {
  if (isAttachedEmail(original)) {
    router.push({ pathname: '/message', params: { path: saved, name: original.filename } });
    return;
  }
  if (Platform.OS === 'ios' && (VCARD_TYPES.includes(original.mimeType) || VCARD.test(original.filename))) {
    const uri = fileUri(saved);
    if (!(await presentVCard(await new File(uri).text()))) await share(uri, original);
    return;
  }
  const { path, attachment } = await readableCopy(saved, original);
  const uri = fileUri(path);
  if (attachment.mimeType === UNKNOWN_TYPE) return share(uri, attachment);

  if (Platform.OS === 'android') {
    try {
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: new File(uri).contentUri,
        type: attachment.mimeType,
        flags: FLAG_GRANT_READ_URI_PERMISSION,
      });
    } catch {
      await share(uri, attachment);
    }
    return;
  }

  const hasExtension = /\.[a-z0-9]+$/i.test(attachment.filename);
  if (hasExtension && attachment.mimeType !== 'text/calendar' && VIEWABLE_ON_IOS.some((type) => attachment.mimeType.startsWith(type))) {
    router.push({ pathname: '/attachment', params: { uri, name: attachment.filename, mimeType: attachment.mimeType } });
    return;
  }
  return share(uri, attachment);
}
