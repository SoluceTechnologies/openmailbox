import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import {
  canAdd,
  forwardedAttachments,
  MAX_ATTACHMENTS_BYTES,
  pickAttachments,
  totalSize,
} from '@/features/composer/attachments';

import { core } from '../../helpers/fixtures';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

describe('composer attachments', () => {
  beforeEach(() => jest.clearAllMocks());

  it('turns picked files into attachments with a readable path', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///data/cache/DocumentPicker/Devis%20sign%C3%A9.pdf', name: 'Devis signé.pdf', mimeType: 'application/pdf', size: 52_000 }],
    });
    expect(await pickAttachments('files')).toEqual([
      { path: '/data/cache/DocumentPicker/Devis signé.pdf', filename: 'Devis signé.pdf', mimeType: 'application/pdf', size: 52_000 },
    ]);
    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith({ multiple: true, copyToCacheDirectory: true });
  });

  it('names photos that come without a file name', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///data/cache/ImagePicker/1.jpeg', fileName: null, mimeType: 'image/jpeg', fileSize: 1_000 }],
    });
    const [photo] = await pickAttachments('photos');
    expect(photo).toEqual({ path: '/data/cache/ImagePicker/1.jpeg', filename: '1.jpeg', mimeType: 'image/jpeg', size: 1_000 });
  });

  it('returns nothing when the picker is cancelled', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
    expect(await pickAttachments('files')).toEqual([]);
  });

  it('keeps the total within 25 MB', () => {
    expect(MAX_ATTACHMENTS_BYTES).toBe(26_214_400);
    const current = [{ path: '/a', filename: 'a', mimeType: 'application/pdf', size: 20_000_000 }];
    expect(totalSize(current)).toBe(20_000_000);
    expect(canAdd(current, [{ path: '/b', filename: 'b', mimeType: 'image/png', size: 6_214_400 }])).toBe(true);
    expect(canAdd(current, [{ path: '/b', filename: 'b', mimeType: 'image/png', size: 6_214_401 }])).toBe(false);
  });

  it('copies the attachments of a forwarded message', async () => {
    core.saveAttachment.mockImplementation(async (_emailId, index) => `/cache/attachments/email-1-${index}/plan.pdf`);
    const forwarded = await forwardedAttachments('email-1', [
      { index: 0, filename: 'plan.pdf', mimeType: 'application/pdf', size: 100 },
    ]);
    expect(forwarded).toEqual([{ path: '/cache/attachments/email-1-0/plan.pdf', filename: 'plan.pdf', mimeType: 'application/pdf', size: 100 }]);
    expect(core.saveAttachment).toHaveBeenCalledWith('email-1', 0, '/cache/attachments');
  });
});
