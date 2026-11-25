import { screen } from '@testing-library/react-native';
import { MailboxRole } from '@openmailbox/mail-core';

import SearchScreen from '../../app/search';
import { queryClient, queryKeys } from '@/core/queryClient';
import i18n from '@/utils/i18n';

import { core, makeEmail, makeMailbox } from '../helpers/fixtures';
import { renderWithProviders } from '../helpers/render';

const mockParams: { query?: string } = {};
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

describe('search screen', () => {
  beforeAll(() => i18n.changeLanguage('en'));

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    queryClient.setQueryData(queryKeys.mailboxes, [makeMailbox({ role: MailboxRole.Inbox })]);
    core.search.mockResolvedValue([{ email: makeEmail(), mailboxId: 'mailbox-inbox' }]);
  });

  it('opens on the messages of a sender when given one', async () => {
    mockParams.query = 'claire@example.com';
    renderWithProviders(<SearchScreen />);
    expect(screen.getByLabelText('Search')).toHaveProp('value', 'claire@example.com');
    await screen.findByText('Claire Dubois');
    expect(core.search).toHaveBeenCalledWith('claire@example.com', expect.any(Number), []);
  });

  it('starts empty otherwise', () => {
    delete mockParams.query;
    renderWithProviders(<SearchScreen />);
    expect(screen.getByLabelText('Search')).toHaveProp('value', '');
    expect(core.search).not.toHaveBeenCalled();
  });
});
