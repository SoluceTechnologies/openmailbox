import { act, fireEvent, screen } from '@testing-library/react-native';
import { Destination, Keyword, MailboxRole } from '@openmailbox/mail-core';

import { queryClient, queryKeys } from '@/core/queryClient';
import { SearchResults } from '@/features/search/SearchResults';
import i18n from '@/utils/i18n';

import { core, makeEmail, makeMailbox, NOW } from '../../helpers/fixtures';
import { renderWithProviders } from '../../helpers/render';

jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useRouter: () => ({ push: jest.fn() }) }));

const hit = { email: makeEmail({ id: 'email-7', threadId: 'thread-7' }), mailboxId: 'mailbox-inbox' };

describe('SearchResults', () => {
  beforeAll(async () => {
    jest.useFakeTimers({ now: NOW });
    await i18n.changeLanguage('en');
  });
  afterAll(() => jest.useRealTimers());

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    queryClient.setQueryData(queryKeys.mailboxes, [makeMailbox(), makeMailbox({ id: 'mailbox-archive', name: 'Archive', role: MailboxRole.Archive })]);
    core.search.mockResolvedValue([hit]);
    core.moveThread.mockResolvedValue({ targetMailboxId: undefined, emailIds: [] });
  });

  it('swipes a result to mark it read or archive its conversation', async () => {
    renderWithProviders(<SearchResults query="atlas" />);
    await screen.findByText('Claire Dubois');

    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Read' })));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Archive' })));

    expect(core.setThreadKeywords).toHaveBeenCalledWith('mailbox-inbox', 'thread-7', [Keyword.Seen], []);
    expect(core.moveThread).toHaveBeenCalledWith('mailbox-inbox', 'thread-7', expect.any(Destination.Archive), expect.any(Number));
  });

  it('opens the other actions from More, without sorting into categories', async () => {
    renderWithProviders(<SearchResults query="atlas" />);
    await screen.findByText('Claire Dubois');

    fireEvent.press(screen.getByRole('button', { name: 'More' }));

    expect(await screen.findByText('Move…')).toBeOnTheScreen();
    expect(screen.queryByText(i18n.t('threads.categorize'))).toBeNull();
  });
});
