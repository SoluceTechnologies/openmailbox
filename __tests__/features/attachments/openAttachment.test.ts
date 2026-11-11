import { Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { router } from 'expo-router';
import type { Attachment } from '@openmailbox/mail-core';

import { openAttachment } from '@/features/attachments/openAttachment';

import { core } from '../../helpers/fixtures';

jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), router: { push: jest.fn() } }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(async () => undefined) }));
jest.mock('expo-intent-launcher', () => ({ startActivityAsync: jest.fn(async () => ({ resultCode: 0 })) }));
jest.mock('expo-file-system', () => ({
  ...jest.requireActual('expo-file-system'),
  File: class {
    contentUri: string;
    constructor(uri: string) {
      this.contentUri = uri.replace('file:///cache', 'content://com.soluce.openmailbox.provider/cache');
    }
  },
}));

const PDF: Attachment = { index: 0, filename: 'Facture n°12.pdf', mimeType: 'application/pdf', size: 1200 };
const ZIP: Attachment = { index: 1, filename: 'archives.zip', mimeType: 'application/zip', size: 1200 };
const UNKNOWN: Attachment = { index: 2, filename: 'data', mimeType: 'application/octet-stream', size: 1200 };

function onPlatform(os: 'ios' | 'android') {
  jest.replaceProperty(Platform, 'OS', os);
}

describe('openAttachment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    core.saveAttachment.mockImplementation(async (_emailId, index) => `/cache/attachments/email-1-${index}/file`);
  });

  afterEach(() => jest.restoreAllMocks());

  it('shows a PDF in the viewer on iOS', async () => {
    onPlatform('ios');
    await openAttachment('email-1', PDF);
    expect(core.saveAttachment).toHaveBeenCalledWith('email-1', 0, '/cache/attachments');
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/attachment',
      params: { uri: 'file:///cache/attachments/email-1-0/file', name: 'Facture n°12.pdf', mimeType: 'application/pdf' },
    });
  });

  it('shares a file named without an extension on iOS, which the viewer could not show', async () => {
    onPlatform('ios');
    await openAttachment('email-1', { ...PDF, filename: 'Facture' });
    expect(router.push).not.toHaveBeenCalled();
    expect(Sharing.shareAsync).toHaveBeenCalled();
  });

  it('encodes the characters of a file name that would break its address', async () => {
    onPlatform('ios');
    core.saveAttachment.mockResolvedValueOnce('/cache/attachments/email-1-0/Plan #2 100%.pdf');
    await openAttachment('email-1', { ...PDF, filename: 'Plan #2 100%.pdf' });
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ uri: 'file:///cache/attachments/email-1-0/Plan%20%232%20100%25.pdf' }),
      }),
    );
  });

  it('hands other types to the share sheet on iOS', async () => {
    onPlatform('ios');
    await openAttachment('email-1', ZIP);
    expect(router.push).not.toHaveBeenCalled();
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/attachments/email-1-1/file', {
      mimeType: 'application/zip',
      dialogTitle: 'archives.zip',
    });
  });

  it('opens a PDF with the app Android picks', async () => {
    onPlatform('android');
    await openAttachment('email-1', PDF);
    expect(IntentLauncher.startActivityAsync).toHaveBeenCalledWith('android.intent.action.VIEW', {
      data: 'content://com.soluce.openmailbox.provider/cache/attachments/email-1-0/file',
      type: 'application/pdf',
      flags: 1,
    });
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('falls back to the share sheet when no Android app opens the type', async () => {
    onPlatform('android');
    (IntentLauncher.startActivityAsync as jest.Mock).mockRejectedValueOnce(new Error('No Activity found'));
    await openAttachment('email-1', PDF);
    expect(Sharing.shareAsync).toHaveBeenCalled();
  });

  it('shares files of unknown type on both platforms', async () => {
    for (const os of ['ios', 'android'] as const) {
      onPlatform(os);
      await openAttachment('email-1', UNKNOWN);
    }
    expect(Sharing.shareAsync).toHaveBeenCalledTimes(2);
    expect(IntentLauncher.startActivityAsync).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });
});
