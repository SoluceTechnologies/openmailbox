import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { router } from 'expo-router';
import type { Attachment } from '@openmailbox/mail-core';

import { attachmentsDirectory, mailCore } from '@/core/mailCore';

/** Types WebKit renders in place on iOS; anything else goes to the share sheet. */
export const VIEWABLE_ON_IOS = [
  'application/pdf',
  'image/',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
];

const UNKNOWN_TYPE = 'application/octet-stream';
const FLAG_GRANT_READ_URI_PERMISSION = 1;

function share(uri: string, attachment: Attachment): Promise<void> {
  return Sharing.shareAsync(uri, { mimeType: attachment.mimeType, dialogTitle: attachment.filename });
}

/** Downloads the attachment if needed and opens it with what the phone has for its type. */
export async function openAttachment(emailId: string, attachment: Attachment): Promise<void> {
  const path = await mailCore().saveAttachment(emailId, attachment.index, attachmentsDirectory());
  const uri = `file://${path.split('/').map(encodeURIComponent).join('/')}`;
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
  if (hasExtension && VIEWABLE_ON_IOS.some((type) => attachment.mimeType.startsWith(type))) {
    router.push({ pathname: '/attachment', params: { uri, name: attachment.filename, mimeType: attachment.mimeType } });
    return;
  }
  return share(uri, attachment);
}
