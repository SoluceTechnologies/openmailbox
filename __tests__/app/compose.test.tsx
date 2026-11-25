import { Alert, BackHandler, InputAccessoryView, Platform } from 'react-native';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import ComposeScreen from '../../app/compose';
import { queryClient, queryKeys } from '@/core/queryClient';
import { forwardedAttachments, pickAttachments } from '@/features/composer/attachments';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUndoStore } from '@/stores/undoStore';
import i18n from '@/utils/i18n';

import { core, makeAccount, makeEmail } from '../helpers/fixtures';
import { renderWithProviders } from '../helpers/render';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useRouter: () => mockRouter,
  router: { back: () => mockRouter.back(), replace: (href: string) => mockRouter.replace(href), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/features/composer/attachments', () => ({
  ...jest.requireActual('@/features/composer/attachments'),
  pickAttachments: jest.fn(),
  forwardedAttachments: jest.fn(async () => []),
}));

const { enriched } = jest.requireMock('react-native-enriched-html') as { enriched: Record<string, jest.Mock> };
const type = (text: string) => fireEvent(screen.getByTestId('rich-body'), 'changeText', { nativeEvent: { value: text } });
const bodyEvent = (name: string, nativeEvent?: object) => fireEvent(screen.getByTestId('rich-body'), name, nativeEvent && { nativeEvent });
const styles = (active: string[]) =>
  Object.fromEntries(
    ['bold', 'italic', 'underline', 'strikeThrough', 'unorderedList', 'orderedList', 'link'].map((key) => [key, { isActive: active.includes(key), isConflicting: false, isBlocking: false }]),
  );
const sig = (text: string) => ({ html: text, text });
const DEVIS = { path: '/cache/Devis.pdf', filename: 'Devis.pdf', mimeType: 'application/pdf', size: 52_224 };

async function pickFiles(picked: typeof DEVIS[]) {
  (pickAttachments as jest.Mock).mockResolvedValueOnce(picked);
  fireEvent.press(screen.getByRole('button', { name: i18n.t('compose.attach') }));
  await act(async () => fireEvent.press(await screen.findByText(i18n.t('compose.attachFiles'))));
}

async function sendTo(address: string) {
  fireEvent.changeText(screen.getByLabelText('To'), address);
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Send' })));
  await waitFor(() => expect(core.send).toHaveBeenCalled());
  return core.send.mock.calls[0][0];
}

describe('composer', () => {
  beforeAll(() => i18n.changeLanguage('en'));

  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    queryClient.clear();
    useSettingsStore.setState({ defaultAccountId: null, signatures: {}, sentFromFooter: false });
    queryClient.setQueryData(queryKeys.accounts, [makeAccount()]);
    enriched.getHTML.mockResolvedValue('<html></html>');
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

    it("waits for the original's attachments before a forward can be sent, keeping files picked meanwhile", async () => {
      mockParams = { mode: 'forward', emailId: 'email-1', threadId: 'thread-1', mailboxId: 'mailbox-inbox' };
      core.threadEmails.mockResolvedValue([makeEmail({ hasAttachment: true })]);
      const original = [{ index: 0, filename: 'Plan.pdf', mimeType: 'application/pdf', size: 1_000 }];
      core.body.mockResolvedValue({ text: 'Voici le plan.', hasRemoteContent: false, attachments: original });
      let finish: (attachments: (typeof DEVIS)[]) => void = () => undefined;
      (forwardedAttachments as jest.Mock).mockReturnValue(new Promise((resolve) => (finish = resolve)));
      renderWithProviders(<ComposeScreen />);
      await waitFor(() => expect(forwardedAttachments).toHaveBeenCalled());
      fireEvent.changeText(screen.getByLabelText('To'), 'bob@example.org');

      expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
      await pickFiles([DEVIS]);
      await act(async () => finish([{ ...DEVIS, path: '/cache/Plan.pdf', filename: 'Plan.pdf', size: 1_000 }]));

      expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
      expect(screen.getByText('Plan.pdf')).toBeOnTheScreen();
      expect(screen.getByText('Devis.pdf')).toBeOnTheScreen();
    });

    it("says when the original's attachments could not be downloaded", async () => {
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      mockParams = { mode: 'forward', emailId: 'email-1', threadId: 'thread-1', mailboxId: 'mailbox-inbox' };
      core.threadEmails.mockResolvedValue([makeEmail({ hasAttachment: true })]);
      const original = [{ index: 0, filename: 'Plan.pdf', mimeType: 'application/pdf', size: 1_000 }];
      core.body.mockResolvedValue({ text: 'Voici le plan.', hasRemoteContent: false, attachments: original });
      (forwardedAttachments as jest.Mock).mockRejectedValue(new Error('offline'));
      renderWithProviders(<ComposeScreen />);

      await waitFor(() => expect(alert).toHaveBeenCalledWith(i18n.t('compose.forwardedAttachmentsFailed')));
      fireEvent.changeText(screen.getByLabelText('To'), 'bob@example.org');
      expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
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
      expect(useUndoStore.getState().entry).toEqual({ label: 'Message sent', moves: [] });
    });
  });

  describe('mailto links', () => {
    it('fills in the message a mailto link describes', async () => {
      mockParams = { mailto: 'mailto:bob@example.com?cc=carol@example.com&subject=Hello&body=Hi%0D%0A%0D%0ASee%20https%3A%2F%2Fopenmailbox.eu' };
      renderWithProviders(<ComposeScreen />);

      expect(screen.getByDisplayValue('Hello')).toBeOnTheScreen();
      expect(enriched.setValue).toHaveBeenCalledWith('<p>Hi</p><br><p>See <a href="https://openmailbox.eu">https://openmailbox.eu</a></p>');
      await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Send' })));
      await waitFor(() => expect(core.send).toHaveBeenCalled());
      const draft = core.send.mock.calls[0][0];
      expect([draft.to, draft.cc, draft.subject]).toEqual([[{ email: 'bob@example.com' }], [{ email: 'carol@example.com' }], 'Hello']);
    });
  });

  describe('signatures', () => {
    const CHARLES = { html: '<b>Charles</b>', text: 'Charles' };
    const FOOTER = 'Sent from Open Mailbox (https://openmailbox.eu)';
    const FOOTER_LINK = 'Sent from <a href="https://openmailbox.eu">Open Mailbox</a>';

    it('keeps the body for the message and sends the signature and the linked footer below it', async () => {
      useSettingsStore.setState({ signatures: { 'account-1': CHARLES }, sentFromFooter: true });
      renderWithProviders(<ComposeScreen />);
      type('Hi https://soluce.eu');
      enriched.getHTML.mockResolvedValue('<html>\n<p>Hi <a href="https://soluce.eu">https://soluce.eu</a></p>\n</html>');
      const draft = await sendTo('bob@example.org');
      expect(draft.bodyText).toBe(`Hi https://soluce.eu\n\n-- \nCharles\n\n${FOOTER}`);
      expect(draft.bodyHtml).toMatch(/^<div style="font-family: /);
      expect(draft.bodyHtml).toContain('<p style="margin: 0">Hi <a href="https://soluce.eu">https://soluce.eu</a></p><br><br><div><b>Charles</b></div>');
      expect(draft.bodyHtml).toContain(FOOTER_LINK);
    });

    it('leaves the signature and the footer out once removed from the message', async () => {
      useSettingsStore.setState({ signatures: { 'account-1': CHARLES }, sentFromFooter: true });
      renderWithProviders(<ComposeScreen />);
      type('Hi');
      enriched.getHTML.mockResolvedValue('<html><p>Hi</p></html>');
      fireEvent.press(await screen.findByRole('button', { name: 'Remove Signature' }));
      const draft = await sendTo('bob@example.org');
      expect(draft.bodyText).toBe('Hi');
      expect(draft.bodyHtml).not.toContain('Charles');
      expect(draft.bodyHtml).not.toContain('openmailbox.eu');
    });

    it("sends the new sender's signature after the sender changes", async () => {
      queryClient.setQueryData(queryKeys.accounts, [makeAccount(), makeAccount({ id: 'account-2', email: 'charles@soluce.example' })]);
      useSettingsStore.setState({ signatures: { 'account-1': sig('Alice'), 'account-2': sig('Charles, Soluce') } });
      renderWithProviders(<ComposeScreen />);
      fireEvent.press(screen.getByText(/Cc\/Bcc/));
      fireEvent.press(screen.getByRole('button', { name: 'From' }));
      fireEvent.press(await screen.findByText('charles@soluce.example'));
      expect((await sendTo('bob@example.org')).bodyText).toBe('\n\n-- \nCharles, Soluce');
    });

    it('puts the quote of a plain-text reply in the HTML part too', async () => {
      mockParams = { mode: 'reply', emailId: 'email-1', threadId: 'thread-1', mailboxId: 'mailbox-inbox' };
      core.threadEmails.mockResolvedValue([makeEmail()]);
      core.body.mockResolvedValue({ text: 'Bonjour', hasRemoteContent: false, attachments: [] });
      renderWithProviders(<ComposeScreen />);
      await screen.findByText(/> Bonjour/);
      await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Send' })));
      await waitFor(() => expect(core.send).toHaveBeenCalled());
      expect(core.send.mock.calls[0][0].bodyHtml).toContain('&gt; Bonjour');
    });
  });

  describe('body', () => {
    it('focuses the start of the body when replying', async () => {
      mockParams = { mode: 'reply', emailId: 'email-1', threadId: 'thread-1', mailboxId: 'mailbox-inbox' };
      core.threadEmails.mockResolvedValue([makeEmail()]);
      core.body.mockResolvedValue({ text: 'Bonjour', hasRemoteContent: false, attachments: [] });
      renderWithProviders(<ComposeScreen />);
      await screen.findByText(/> Bonjour/);
      await waitFor(() => expect(enriched.setSelection).toHaveBeenCalledWith(0, 0));
      expect(enriched.focus).toHaveBeenCalled();
    });

    it('sends what was just typed', async () => {
      renderWithProviders(<ComposeScreen />);
      type('Hello');
      enriched.getHTML.mockResolvedValue('<html><p>Hello</p></html>');
      const draft = await sendTo('bob@example.org');
      expect(draft.bodyText).toBe('Hello');
      expect(draft.bodyHtml).toContain('<p style="margin: 0">Hello</p>');
    });

    it('asks before discarding typed text', () => {
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      renderWithProviders(<ComposeScreen />);
      type('Hi');
      fireEvent.press(screen.getByRole('button', { name: 'Close' }));
      expect(alert).toHaveBeenCalledWith(i18n.t('compose.discardTitle'), undefined, expect.any(Array));
    });

    it('closes without asking once the body is emptied again', () => {
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      renderWithProviders(<ComposeScreen />);
      type('Hi');
      type('');
      fireEvent.press(screen.getByRole('button', { name: 'Close' }));
      expect(alert).not.toHaveBeenCalled();
      expect(mockRouter.back).toHaveBeenCalled();
    });
  });

  describe('formatting on iOS', () => {
    it('rides on the keyboard of the body', () => {
      renderWithProviders(<ComposeScreen />);
      const accessory = screen.UNSAFE_getByType(InputAccessoryView);
      expect(accessory.props.nativeID).toBe(screen.getByTestId('rich-body').props.nativeID);
      expect(within(accessory).getByTestId('format-bar', { includeHiddenElements: true })).toBeOnTheScreen();
    });

    it('shares one keyboard accessory across the fields so the keyboard is not rebuilt', () => {
      renderWithProviders(<ComposeScreen />);
      const shared = screen.getByLabelText('To').props.inputAccessoryViewID;
      expect(shared.startsWith(`${screen.getByTestId('rich-body').props.nativeID}.`)).toBe(true);
      expect(screen.getByLabelText('Subject').props.inputAccessoryViewID).toBe(shared);
      fireEvent.press(screen.getByText(/Cc\/Bcc/));
      expect(screen.getByLabelText('Cc').props.inputAccessoryViewID).toBe(shared);
      expect(screen.getByLabelText('Bcc').props.inputAccessoryViewID).toBe(shared);
    });

    it('gives each compose its own field accessory id so recycled native inputs pick it up', () => {
      const first = renderWithProviders(<ComposeScreen />);
      const before = screen.getByLabelText('Subject').props.inputAccessoryViewID;
      first.unmount();
      renderWithProviders(<ComposeScreen />);
      expect(screen.getByLabelText('Subject').props.inputAccessoryViewID).not.toBe(before);
    });

    it('edits the link in a card that keeps the keyboard bar, hidden', () => {
      renderWithProviders(<ComposeScreen />);
      bodyEvent('focus');
      fireEvent.press(screen.getByRole('button', { name: 'Formatting' }));
      bodyEvent('changeSelection', { start: 0, end: 5, text: 'Hello' });
      fireEvent.press(screen.getByRole('button', { name: 'Link' }));
      bodyEvent('blur');
      const fields = screen.getByLabelText('Subject').props.inputAccessoryViewID;
      const first = screen.getByTestId('link-url').props.inputAccessoryViewID;
      expect(first.startsWith(`${fields}.`)).toBe(true);
      expect(screen.getByTestId('format-bar', { includeHiddenElements: true })).toHaveProp('pointerEvents', 'none');
      fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
      bodyEvent('focus');
      fireEvent.press(screen.getByRole('button', { name: 'Link' }));
      expect(screen.getByTestId('link-url').props.inputAccessoryViewID).not.toBe(first);
      fireEvent.changeText(screen.getByTestId('link-url'), 'soluce.eu');
      fireEvent.press(screen.getByRole('button', { name: 'OK' }));
      expect(enriched.setLink).toHaveBeenCalledWith(0, 5, 'Hello', 'https://soluce.eu');
      expect(enriched.focus).toHaveBeenCalled();
    });

    it('hides the bar while another field has the keyboard', () => {
      renderWithProviders(<ComposeScreen />);
      const bar = () => screen.getByTestId('format-bar', { includeHiddenElements: true });
      expect(bar()).toHaveProp('pointerEvents', 'none');
      bodyEvent('focus');
      expect(bar()).toHaveProp('pointerEvents', 'box-none');
      bodyEvent('blur');
      expect(bar()).toHaveProp('pointerEvents', 'none');
    });
  });

  describe('formatting', () => {
    beforeEach(() => jest.replaceProperty(Platform, 'OS', 'android'));

    it('shows the format button only while writing the body', () => {
      renderWithProviders(<ComposeScreen />);
      expect(screen.queryByRole('button', { name: 'Formatting' })).toBeNull();
      bodyEvent('focus');
      expect(screen.getByRole('button', { name: 'Formatting' })).toBeOnTheScreen();
      bodyEvent('blur');
      expect(screen.queryByRole('button', { name: 'Formatting' })).toBeNull();
    });

    it('expands and collapses the tools', () => {
      renderWithProviders(<ComposeScreen />);
      bodyEvent('focus');
      expect(screen.queryByRole('button', { name: 'Bold' })).toBeNull();
      fireEvent.press(screen.getByRole('button', { name: 'Formatting' }));
      expect(screen.getByRole('button', { name: 'Bold' })).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Hide Formatting' }));
      expect(screen.queryByRole('button', { name: 'Bold' })).toBeNull();
    });

    it('lights up the tools for the text under the cursor', () => {
      renderWithProviders(<ComposeScreen />);
      bodyEvent('focus');
      fireEvent.press(screen.getByRole('button', { name: 'Formatting' }));
      bodyEvent('changeState', styles(['bold', 'unorderedList']));
      expect(screen.getByRole('button', { name: 'Bold' })).toHaveProp('accessibilityState', { selected: true });
      expect(screen.getByRole('button', { name: 'Bulleted List' })).toHaveProp('accessibilityState', { selected: true });
      expect(screen.getByRole('button', { name: 'Italic' })).toHaveProp('accessibilityState', { selected: false });
    });

    it('formats through the native editor', () => {
      renderWithProviders(<ComposeScreen />);
      bodyEvent('focus');
      fireEvent.press(screen.getByRole('button', { name: 'Formatting' }));
      fireEvent.press(screen.getByRole('button', { name: 'Bold' }));
      fireEvent.press(screen.getByRole('button', { name: 'Bulleted List' }));
      expect(enriched.toggleBold).toHaveBeenCalled();
      expect(enriched.toggleUnorderedList).toHaveBeenCalled();
      fireEvent.press(screen.getByRole('button', { name: 'Text Color' }));
      fireEvent.press(screen.getByRole('button', { name: 'Red' }));
      expect(enriched.setStyle).toHaveBeenCalledWith({ foregroundColor: '#dc2626' });
      fireEvent.press(screen.getByRole('button', { name: 'Highlight' }));
      fireEvent.press(screen.getByRole('button', { name: 'Yellow' }));
      expect(enriched.setStyle).toHaveBeenCalledWith({ backgroundColor: '#fef08a' });
      enriched.toggleBold.mockClear();
      fireEvent.press(screen.getByRole('button', { name: 'Text Size' }));
      fireEvent.press(screen.getByText('Title'));
      expect(enriched.setStyle).toHaveBeenCalledWith({ fontSize: 22 });
      expect(enriched.toggleBold).toHaveBeenCalledTimes(1);
    });

    it('clears colours, size and the active styles', () => {
      renderWithProviders(<ComposeScreen />);
      bodyEvent('focus');
      fireEvent.press(screen.getByRole('button', { name: 'Formatting' }));
      bodyEvent('changeState', styles(['bold', 'underline']));
      fireEvent.press(screen.getByRole('button', { name: 'Clear Formatting' }));
      expect(enriched.setStyle).toHaveBeenCalledWith({ foregroundColor: null, backgroundColor: null, fontSize: null });
      expect(enriched.toggleBold).toHaveBeenCalled();
      expect(enriched.toggleUnderline).toHaveBeenCalled();
      expect(enriched.toggleItalic).not.toHaveBeenCalled();
    });

    it('links the selected text', () => {
      renderWithProviders(<ComposeScreen />);
      bodyEvent('focus');
      fireEvent.press(screen.getByRole('button', { name: 'Formatting' }));
      bodyEvent('changeSelection', { start: 0, end: 5, text: 'Hello' });
      fireEvent.press(screen.getByRole('button', { name: 'Link' }));
      fireEvent.changeText(screen.getByTestId('link-url'), 'soluce.eu');
      fireEvent.press(screen.getByRole('button', { name: 'OK' }));
      expect(enriched.setLink).toHaveBeenCalledWith(0, 5, 'Hello', 'https://soluce.eu');
    });

    it('edits or removes the link under the cursor', () => {
      renderWithProviders(<ComposeScreen />);
      bodyEvent('focus');
      fireEvent.press(screen.getByRole('button', { name: 'Formatting' }));
      bodyEvent('changeSelection', { start: 4, end: 4, text: '' });
      fireEvent(screen.getByTestId('rich-body'), 'linkDetected', { text: 'site', url: 'https://a.eu', start: 3, end: 7 });
      bodyEvent('changeState', styles(['link']));
      fireEvent.press(screen.getByRole('button', { name: 'Link' }));
      expect(screen.getByDisplayValue('https://a.eu')).toBeOnTheScreen();
      fireEvent.changeText(screen.getByTestId('link-url'), 'b.eu');
      fireEvent.press(screen.getByRole('button', { name: 'OK' }));
      expect(enriched.setLink).toHaveBeenCalledWith(3, 7, 'site', 'https://b.eu');
      fireEvent.press(screen.getByRole('button', { name: 'Link' }));
      fireEvent.press(screen.getByRole('button', { name: 'Remove Link' }));
      expect(enriched.removeLink).toHaveBeenCalledWith(3, 7);
    });

    it('closes the link card with the back button and goes back to the body', () => {
      const back = jest.spyOn(BackHandler, 'addEventListener');
      renderWithProviders(<ComposeScreen />);
      bodyEvent('focus');
      fireEvent.press(screen.getByRole('button', { name: 'Formatting' }));
      bodyEvent('changeSelection', { start: 0, end: 5, text: 'Hello' });
      fireEvent.press(screen.getByRole('button', { name: 'Link' }));
      expect(screen.getByTestId('link-url')).toBeOnTheScreen();
      const handler = back.mock.calls.find(([event]) => event === 'hardwareBackPress')?.[1];
      act(() => {
        expect((handler as () => boolean)()).toBe(true);
      });
      expect(screen.queryByTestId('link-url')).toBeNull();
      expect(enriched.setLink).not.toHaveBeenCalled();
      expect(enriched.setSelection).toHaveBeenCalledWith(0, 5);
    });

    it('keeps quotes out of a typed link address', () => {
      renderWithProviders(<ComposeScreen />);
      bodyEvent('focus');
      fireEvent.press(screen.getByRole('button', { name: 'Formatting' }));
      bodyEvent('changeSelection', { start: 0, end: 2, text: 'Hi' });
      fireEvent.press(screen.getByRole('button', { name: 'Link' }));
      fireEvent.changeText(screen.getByTestId('link-url'), 'https://x.eu/" onclick="a');
      fireEvent.press(screen.getByRole('button', { name: 'OK' }));
      expect(enriched.setLink).toHaveBeenCalledWith(0, 2, 'Hi', 'https://x.eu/%22%20onclick=%22a');
    });

    it('goes back to the body where it was before applying a colour', () => {
      renderWithProviders(<ComposeScreen />);
      bodyEvent('focus');
      fireEvent.press(screen.getByRole('button', { name: 'Formatting' }));
      bodyEvent('changeSelection', { start: 2, end: 2, text: '' });
      fireEvent.press(screen.getByRole('button', { name: 'Text Color' }));
      bodyEvent('blur');
      fireEvent.press(screen.getByRole('button', { name: 'Red' }));
      expect(enriched.focus).toHaveBeenCalled();
      expect(enriched.setSelection).toHaveBeenCalledWith(2, 2);
      expect(enriched.setSelection.mock.invocationCallOrder[0]).toBeLessThan(enriched.setStyle.mock.invocationCallOrder[0]);
    });

    it('keeps the bar while a sheet from it is open', () => {
      renderWithProviders(<ComposeScreen />);
      bodyEvent('focus');
      fireEvent.press(screen.getByRole('button', { name: 'Formatting' }));
      fireEvent.press(screen.getByRole('button', { name: 'Text Color' }));
      bodyEvent('blur');
      expect(screen.getByRole('button', { name: 'Hide Formatting' })).toBeOnTheScreen();
    });
  });

  describe('identities', () => {
    const support = { id: 'identity-1', name: 'Support', email: 'info@example.com', signature: sig('Support team') };

    beforeEach(() => {
      useSettingsStore.setState({ signatures: { 'account-1': sig('Alice') }, identities: { 'account-1': [support] } });
    });

    it('sends from the picked identity with its signature', async () => {
      renderWithProviders(<ComposeScreen />);
      fireEvent.press(screen.getByText(/Cc\/Bcc/));
      fireEvent.press(screen.getByRole('button', { name: 'From' }));
      fireEvent.press(await screen.findByText('info@example.com'));
      const draft = await sendTo('bob@example.org');
      expect(draft.from).toEqual({ name: 'Support', email: 'info@example.com' });
      expect(draft.bodyText).toBe('\n\n-- \nSupport team');
    });

    it("sends from the account's own address without a sender", async () => {
      renderWithProviders(<ComposeScreen />);
      expect((await sendTo('bob@example.org')).from).toBeUndefined();
    });

    it('replies from the identity the original was sent to, leaving it out of the recipients', async () => {
      mockParams = { mode: 'replyAll', emailId: 'email-1', threadId: 'thread-1', mailboxId: 'mailbox-inbox' };
      core.threadEmails.mockResolvedValue([
        makeEmail({ to: [{ name: undefined, email: 'INFO@example.com' }, { name: 'Carol', email: 'carol@example.org' }] }),
      ]);
      core.body.mockResolvedValue({ text: 'Bonjour', hasRemoteContent: false, attachments: [] });
      renderWithProviders(<ComposeScreen />);

      expect(await screen.findByText('Cc/Bcc, From: info@example.com')).toBeOnTheScreen();
      await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Send' })));
      await waitFor(() => expect(core.send).toHaveBeenCalled());
      const draft = core.send.mock.calls[0][0];
      expect(draft.from).toEqual({ name: 'Support', email: 'info@example.com' });
      expect(draft.bodyText).toContain('-- \nSupport team');
      expect(draft.to.map((address: { email: string }) => address.email)).toEqual(['claire@atlas.example', 'carol@example.org']);
    });
  });
});
