import { Alert } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import ComposeScreen from '../../app/compose';
import { queryClient, queryKeys } from '@/core/queryClient';
import { forwardedAttachments, pickAttachments } from '@/features/composer/attachments';
import { useSettingsStore } from '@/stores/settingsStore';
import i18n from '@/utils/i18n';

import { core, makeAccount, makeEmail } from '../helpers/fixtures';
import { renderWithProviders } from '../helpers/render';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/features/composer/attachments', () => ({
  ...jest.requireActual('@/features/composer/attachments'),
  pickAttachments: jest.fn(),
  forwardedAttachments: jest.fn(async () => []),
}));

const DEVIS = { path: '/cache/Devis.pdf', filename: 'Devis.pdf', mimeType: 'application/pdf', size: 52_224 };

async function pickFiles(picked: typeof DEVIS[]) {
  (pickAttachments as jest.Mock).mockResolvedValueOnce(picked);
  fireEvent.press(screen.getByRole('button', { name: i18n.t('compose.attach') }));
  await act(async () => fireEvent.press(await screen.findByText(i18n.t('compose.attachFiles'))));
}

describe('composer', () => {
  beforeAll(() => i18n.changeLanguage('en'));

  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    queryClient.clear();
    useSettingsStore.setState({ defaultAccountId: null, signatures: {} });
    queryClient.setQueryData(queryKeys.accounts, [makeAccount()]);
  });

  describe('attachments', () => {
    it('attaches picked files and lets them go again', async () => {
      renderWithProviders(<ComposeScreen />);
      await pickFiles([DEVIS]);
      expect(screen.getByText('Devis.pdf')).toBeOnTheScreen();
      expect(screen.getByText('51 KB')).toBeOnTheScreen();

      fireEvent.press(screen.getByRole('button', { name: i18n.t('compose.removeAttachment', { name: 'Devis.pdf' }) }));
      expect(screen.queryByText('Devis.pdf')).toBeNull();
    });

    it('refuses files that would go past 25 MB', async () => {
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      renderWithProviders(<ComposeScreen />);
      await pickFiles([DEVIS]);
      await pickFiles([{ ...DEVIS, filename: 'Scan.pdf', size: 26_200_000 }]);
      expect(alert).toHaveBeenCalledWith(i18n.t('compose.attachmentsTooLarge'));
      expect(screen.queryByText('Scan.pdf')).toBeNull();
      expect(screen.getByText('Devis.pdf')).toBeOnTheScreen();
    });

    it("keeps the original's attachments when forwarding", async () => {
      mockParams = { mode: 'forward', emailId: 'email-1', threadId: 'thread-1', mailboxId: 'mailbox-inbox' };
      core.threadEmails.mockResolvedValue([makeEmail({ hasAttachment: true })]);
      const original = [{ index: 0, filename: 'Plan.pdf', mimeType: 'application/pdf', size: 1_000 }];
      core.body.mockResolvedValue({ text: 'Voici le plan.', hasRemoteContent: false, attachments: original });
      (forwardedAttachments as jest.Mock).mockResolvedValue([{ ...DEVIS, filename: 'Plan.pdf', size: 1_000 }]);
      renderWithProviders(<ComposeScreen />);

      expect(await screen.findByText('Plan.pdf')).toBeOnTheScreen();
      expect(forwardedAttachments).toHaveBeenCalledWith('email-1', original);
    });

    it('sends the attached files', async () => {
      renderWithProviders(<ComposeScreen />);
      fireEvent.changeText(screen.getByLabelText('To'), 'bob@example.org');
      await pickFiles([DEVIS]);
      await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Send' })));
      await waitFor(() => expect(core.send).toHaveBeenCalled());
      expect(core.send.mock.calls[0][0].attachments).toEqual([
        { path: '/cache/Devis.pdf', filename: 'Devis.pdf', mimeType: 'application/pdf' },
      ]);
    });
  });

  describe('recipients', () => {
    it('blocks sending while an address is invalid', async () => {
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      renderWithProviders(<ComposeScreen />);
      fireEvent.changeText(screen.getByLabelText('To'), 'bob@');
      await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Send' })));
      expect(alert).toHaveBeenCalledWith(i18n.t('compose.invalidAddresses'), 'bob@');
      expect(core.send).not.toHaveBeenCalled();
    });

    it('sends to the chips and to what is still typed', async () => {
      renderWithProviders(<ComposeScreen />);
      fireEvent.changeText(screen.getByLabelText('To'), 'claire@atlas.example,');
      fireEvent.changeText(screen.getByLabelText('To'), 'nadia@x.org');
      await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Send' })));
      await waitFor(() => expect(core.send).toHaveBeenCalled());
      expect(core.send.mock.calls[0][0].to.map((address: { email: string }) => address.email)).toEqual([
        'claire@atlas.example',
        'nadia@x.org',
      ]);
    });
  });

  describe('signatures', () => {
    it("starts a new message with the account's signature", () => {
      useSettingsStore.setState({ signatures: { 'account-1': 'Charles' } });
      renderWithProviders(<ComposeScreen />);
      expect(screen.getByPlaceholderText('Message').props.value).toBe('\n\n-- \nCharles');
    });

    it('swaps an untouched signature when the sending account changes', async () => {
      queryClient.setQueryData(queryKeys.accounts, [makeAccount(), makeAccount({ id: 'account-2', email: 'charles@soluce.example' })]);
      useSettingsStore.setState({ signatures: { 'account-1': 'Alice', 'account-2': 'Charles, Soluce' } });
      renderWithProviders(<ComposeScreen />);
      fireEvent.press(screen.getByText(/Cc\/Bcc/));
      fireEvent.press(screen.getByRole('button', { name: 'From' }));
      fireEvent.press(await screen.findByText('charles@soluce.example'));
      expect(screen.getByPlaceholderText('Message').props.value).toBe('\n\n-- \nCharles, Soluce');
    });
  });
});
