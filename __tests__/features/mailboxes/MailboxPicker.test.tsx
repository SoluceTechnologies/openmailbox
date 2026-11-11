import { fireEvent, screen } from '@testing-library/react-native';
import { MailboxRole } from '@openmailbox/mail-core';

import { queryClient, queryKeys } from '@/core/queryClient';
import { MailboxPicker } from '@/features/mailboxes/components/MailboxPicker';
import i18n from '@/utils/i18n';

import { makeMailbox } from '../../helpers/fixtures';
import { renderWithProviders } from '../../helpers/render';

describe('MailboxPicker', () => {
  beforeAll(() => i18n.changeLanguage('en'));

  beforeEach(() => {
    queryClient.setQueryData(queryKeys.mailboxes, [
      makeMailbox(),
      makeMailbox({ id: 'archive', name: 'Archive', role: MailboxRole.Archive }),
      makeMailbox({ id: 'projects', name: 'Projets', role: undefined, selectable: false }),
      makeMailbox({ id: 'clients', name: 'Clients', role: undefined, depth: 1 }),
      makeMailbox({ id: 'other-inbox', accountId: 'account-2', name: 'INBOX' }),
    ]);
  });

  it("lists the other folders of the thread's account", () => {
    renderWithProviders(
      <MailboxPicker accountId="account-1" excludeMailboxId="mailbox-inbox" visible onSelect={jest.fn()} onClose={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Archive' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Clients' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Inbox' })).toBeNull();
    expect(screen.getByText('Projets')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Projets' })).toBeNull();
  });

  it('returns the folder picked', () => {
    const onSelect = jest.fn();
    renderWithProviders(
      <MailboxPicker accountId="account-1" excludeMailboxId="mailbox-inbox" visible onSelect={onSelect} onClose={jest.fn()} />,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Clients' }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'clients' }));
  });
});
