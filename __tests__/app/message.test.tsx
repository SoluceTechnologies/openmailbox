import { act, fireEvent, screen } from '@testing-library/react-native';
import * as Sharing from 'expo-sharing';

import MessageScreen from '../../app/message';
import { queryClient } from '@/core/queryClient';
import { openAttachmentOfFile } from '@/features/attachments/openAttachment';
import { formatFullDate } from '@/utils/dates';
import i18n from '@/utils/i18n';

import { core } from '../helpers/fixtures';
import { renderWithProviders } from '../helpers/render';

const FILE = '/cache/attachments/email-1-4/Original quote.eml';
let mockParams = { path: FILE, name: 'Original quote.eml', mimeType: 'message/rfc822' };
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(async () => undefined) }));
jest.mock('@/features/attachments/openAttachment', () => ({
  ...jest.requireActual('@/features/attachments/openAttachment'),
  openAttachmentOfFile: jest.fn(async () => undefined),
}));

const DATE = Date.UTC(2026, 10, 24, 9);
const PDF = { index: 0, filename: 'quote.pdf', mimeType: 'application/pdf', size: 1200 };

describe('attached email screen', () => {
  beforeAll(() => i18n.changeLanguage('en'));
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    core.readMessageFile.mockResolvedValue({
      subject: 'Original quote',
      from: [{ name: 'Claire Dubois', email: 'claire@atlas.example' }],
      to: [{ name: undefined, email: 'bob@example.com' }],
      cc: [{ name: 'Nadia', email: 'nadia@atlas.example' }],
      date: BigInt(DATE),
      body: { text: 'Here is the quote.', bcc: [], hasRemoteContent: false, attachments: [PDF] },
    });
  });

  it('shows the email read from its file', async () => {
    renderWithProviders(<MessageScreen />);
    expect(await screen.findByText('Original quote')).toBeOnTheScreen();
    expect(core.readMessageFile).toHaveBeenCalledWith(FILE);
    expect(screen.getByText('Claire Dubois')).toBeOnTheScreen();
    expect(screen.getByText(/bob@example\.com/)).toBeOnTheScreen();
    expect(screen.getByText(/Nadia/)).toBeOnTheScreen();
    expect(screen.getByText(formatFullDate(DATE))).toBeOnTheScreen();
    expect(screen.getByText('Here is the quote.')).toBeOnTheScreen();
  });

  it('opens its attachments from the file', async () => {
    renderWithProviders(<MessageScreen />);
    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Open quote.pdf' })));
    expect(openAttachmentOfFile).toHaveBeenCalledWith(FILE, PDF);
  });

  it('shares the email file', async () => {
    renderWithProviders(<MessageScreen />);
    await screen.findByText('Original quote');
    await act(async () => fireEvent.press(screen.getByRole('button', { name: i18n.t('reader.share') })));
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/attachments/email-1-4/Original%20quote.eml', expect.objectContaining({ mimeType: 'message/rfc822' }));
  });

  it('names an Outlook winmail.dat without a subject by its file', async () => {
    core.readMessageFile.mockResolvedValueOnce({ subject: '', from: [], to: [], cc: [], body: { text: '', bcc: [], hasRemoteContent: false, attachments: [PDF] } });
    mockParams = { path: '/cache/attachments/email-1-9/winmail.dat', name: 'winmail.dat', mimeType: 'application/ms-tnef' };
    renderWithProviders(<MessageScreen />);
    expect(await screen.findByText('winmail.dat')).toBeOnTheScreen();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: i18n.t('reader.share') })));
    expect(Sharing.shareAsync).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ mimeType: 'application/ms-tnef' }));
    mockParams = { path: FILE, name: 'Original quote.eml', mimeType: 'message/rfc822' };
  });

  it('says when the email cannot be read', async () => {
    core.readMessageFile.mockRejectedValueOnce(new Error('unreadable'));
    renderWithProviders(<MessageScreen />);
    expect(await screen.findByText(i18n.t('reader.loadFailed'))).toBeOnTheScreen();
  });
});
