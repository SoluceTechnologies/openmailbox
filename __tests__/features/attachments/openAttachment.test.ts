import { Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { router } from 'expo-router';
import type { Attachment } from '@openmailbox/mail-core';

import { openAttachment, openAttachmentOfFile } from '@/features/attachments/openAttachment';
import { presentVCard } from '@/features/attachments/vcard';
import { queryClient, queryKeys } from '@/core/queryClient';

import { core } from '../../helpers/fixtures';

jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), router: { push: jest.fn() } }));
let mockFileText = '';
jest.mock('@/features/attachments/vcard', () => ({ presentVCard: jest.fn(async (text: string) => text.includes('FN:')) }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(async () => undefined) }));
jest.mock('expo-intent-launcher', () => ({ startActivityAsync: jest.fn(async () => ({ resultCode: 0 })) }));
jest.mock('expo-file-system', () => ({
  ...jest.requireActual('expo-file-system'),
  File: class {
    contentUri: string;
    text = async () => mockFileText;
    constructor(uri: string) {
      this.contentUri = uri.replace('file:///cache', 'content://com.soluce.openmailbox.provider/cache');
    }
  },
}));

const PDF: Attachment = { index: 0, filename: 'Facture n°12.pdf', mimeType: 'application/pdf', size: 1200 };
const ZIP: Attachment = { index: 1, filename: 'archives.zip', mimeType: 'application/zip', size: 1200 };
const UNKNOWN: Attachment = { index: 2, filename: 'data', mimeType: 'application/octet-stream', size: 1200 };
const PHOTO: Attachment = { index: 3, filename: 'Photo.jxl', mimeType: 'image/jxl', size: 1200 };

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

  describe('attached emails', () => {
    const EML: Attachment = { index: 4, filename: 'Original quote.eml', mimeType: 'message/rfc822', size: 900 };
    const WINMAIL: Attachment = { index: 9, filename: 'winmail.dat', mimeType: 'application/ms-tnef', size: 900 };
    const SAVED = {
      subject: 'Original quote',
      from: [],
      to: [],
      cc: [],
      body: { text: '', hasRemoteContent: false, attachments: [PDF] },
    };

    beforeEach(() => core.readMessageFile.mockResolvedValue(SAVED));

    it.each(['ios', 'android'] as const)('opens an attached email in the message screen on %s', async (os) => {
      onPlatform(os);
      core.saveAttachment.mockResolvedValueOnce('/cache/attachments/email-1-4/Original quote.eml');
      await openAttachment('email-1', EML);
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/message',
        params: { path: '/cache/attachments/email-1-4/Original quote.eml', name: 'Original quote.eml', mimeType: 'message/rfc822' },
      });
      expect(queryClient.getQueryData(queryKeys.savedMessage('/cache/attachments/email-1-4/Original quote.eml'))).toBe(SAVED);
      expect(IntentLauncher.startActivityAsync).not.toHaveBeenCalled();
    });

    it.each([WINMAIL, { ...WINMAIL, mimeType: 'application/vnd.ms-tnef' }, { ...WINMAIL, filename: 'WINMAIL.DAT', mimeType: 'application/octet-stream' }])(
      'shows the files of an Outlook $filename ($mimeType)',
      async (attachment) => {
        onPlatform('android');
        await openAttachment('email-1', attachment);
        expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/message' }));
      },
    );

    it('shares a winmail.dat with no files inside', async () => {
      onPlatform('ios');
      core.readMessageFile.mockRejectedValueOnce(new Error('not found'));
      await openAttachment('email-1', WINMAIL);
      expect(router.push).not.toHaveBeenCalled();
      expect(Sharing.shareAsync).toHaveBeenCalledWith(expect.stringContaining('file:///'), expect.objectContaining({ mimeType: 'application/ms-tnef' }));
    });

    it('recognises an .eml file sent without its type', async () => {
      onPlatform('ios');
      await openAttachment('email-1', { ...EML, mimeType: 'application/octet-stream' });
      expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/message' }));
      expect(Sharing.shareAsync).not.toHaveBeenCalled();
    });

    it('opens an attachment of a saved email from its file', async () => {
      onPlatform('ios');
      core.saveAttachmentFromFile.mockResolvedValueOnce('/cache/attachments/Original quote-0/quote.pdf');
      await openAttachmentOfFile('/cache/attachments/email-1-4/Original quote.eml', PDF);
      expect(core.saveAttachmentFromFile).toHaveBeenCalledWith('/cache/attachments/email-1-4/Original quote.eml', 0, '/cache/attachments');
      expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/attachment' }));
    });
  });

  describe('JPEG XL', () => {
    beforeEach(() => {
      core.saveAttachment.mockResolvedValue('/cache/attachments/email-1-3/Photo.jxl');
      core.readableImage.mockResolvedValue('/cache/attachments/email-1-3/Photo.png');
    });

    it('shows a PNG copy of a JPEG XL image in the viewer on iOS', async () => {
      onPlatform('ios');
      await openAttachment('email-1', PHOTO);
      expect(core.readableImage).toHaveBeenCalledWith('/cache/attachments/email-1-3/Photo.jxl');
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/attachment',
        params: { uri: 'file:///cache/attachments/email-1-3/Photo.png', name: 'Photo.jxl', mimeType: 'image/png' },
      });
    });

    it('opens a PNG copy of a JPEG XL image on Android', async () => {
      onPlatform('android');
      await openAttachment('email-1', PHOTO);
      expect(IntentLauncher.startActivityAsync).toHaveBeenCalledWith('android.intent.action.VIEW', {
        data: 'content://com.soluce.openmailbox.provider/cache/attachments/email-1-3/Photo.png',
        type: 'image/png',
        flags: 1,
      });
    });

    it('recognises a JPEG XL image sent without its type', async () => {
      onPlatform('android');
      await openAttachment('email-1', { ...PHOTO, mimeType: 'application/octet-stream' });
      expect(IntentLauncher.startActivityAsync).toHaveBeenCalledWith('android.intent.action.VIEW', expect.objectContaining({ type: 'image/png' }));
      expect(Sharing.shareAsync).not.toHaveBeenCalled();
    });

    it('hands over the original file when it cannot be decoded', async () => {
      onPlatform('android');
      core.readableImage.mockResolvedValueOnce(undefined);
      await openAttachment('email-1', PHOTO);
      expect(IntentLauncher.startActivityAsync).toHaveBeenCalledWith('android.intent.action.VIEW', expect.objectContaining({ type: 'image/jxl' }));
    });

    it('leaves other attachments as they are', async () => {
      onPlatform('ios');
      await openAttachment('email-1', PDF);
      expect(core.readableImage).not.toHaveBeenCalled();
    });
  });

  describe('TIFF', () => {
    const SCAN: Attachment = { index: 5, filename: 'Scan 2026-11-24.tif', mimeType: 'image/tiff', size: 4000 };

    beforeEach(() => {
      core.saveAttachment.mockResolvedValue('/cache/attachments/email-1-5/Scan 2026-11-24.tif');
      core.readableImage.mockResolvedValue('/cache/attachments/email-1-5/Scan 2026-11-24.png');
    });

    it('opens a PNG copy of a scanned TIFF on Android', async () => {
      onPlatform('android');
      await openAttachment('email-1', SCAN);
      expect(core.readableImage).toHaveBeenCalledWith('/cache/attachments/email-1-5/Scan 2026-11-24.tif');
      expect(IntentLauncher.startActivityAsync).toHaveBeenCalledWith('android.intent.action.VIEW', expect.objectContaining({ type: 'image/png' }));
    });

    it.each(['Fax.TIFF', 'fax.tif'])('recognises %s sent without its type', async (filename) => {
      onPlatform('ios');
      await openAttachment('email-1', { ...SCAN, filename, mimeType: 'application/octet-stream' });
      expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ mimeType: 'image/png' }) }));
    });
  });

  it.each([
    ['logo.svg', 'image/svg+xml'],
    ['clip.mp4', 'video/mp4'],
    ['memo.m4a', 'audio/mp4'],
    ['export.csv', 'text/csv'],
    ['README.md', 'text/markdown'],
    ['page.html', 'text/html'],
    ['data.json', 'application/json'],
  ])('shows %s in the viewer on iOS', async (filename, mimeType) => {
    onPlatform('ios');
    await openAttachment('email-1', { index: 6, filename, mimeType, size: 300 });
    expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/attachment' }));
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('shares a calendar file on iOS instead of showing its text', async () => {
    onPlatform('ios');
    await openAttachment('email-1', { index: 7, filename: 'event.ics', mimeType: 'text/calendar', size: 300 });
    expect(router.push).not.toHaveBeenCalled();
    expect(Sharing.shareAsync).toHaveBeenCalled();
  });

  describe('vCards', () => {
    const CARD: Attachment = { index: 8, filename: 'Claire Dubois.vcf', mimeType: 'text/vcard', size: 300 };

    beforeEach(() => {
      mockFileText = 'BEGIN:VCARD\nFN:Claire Dubois\nEND:VCARD';
    });

    it.each([CARD, { ...CARD, mimeType: 'text/x-vcard' }, { ...CARD, mimeType: 'application/octet-stream' }])(
      'opens the new contact form for $mimeType on iOS',
      async (attachment) => {
        onPlatform('ios');
        await openAttachment('email-1', attachment);
        expect(presentVCard).toHaveBeenCalledWith(mockFileText);
        expect(router.push).not.toHaveBeenCalled();
        expect(Sharing.shareAsync).not.toHaveBeenCalled();
      },
    );

    it('shares a card it cannot read', async () => {
      onPlatform('ios');
      mockFileText = 'nothing';
      await openAttachment('email-1', CARD);
      expect(Sharing.shareAsync).toHaveBeenCalled();
    });

    it('lets the Android contacts app import it', async () => {
      onPlatform('android');
      await openAttachment('email-1', CARD);
      expect(presentVCard).not.toHaveBeenCalled();
      expect(IntentLauncher.startActivityAsync).toHaveBeenCalledWith('android.intent.action.VIEW', expect.objectContaining({ type: 'text/vcard' }));
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
