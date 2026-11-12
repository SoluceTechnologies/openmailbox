import { Folder, Inbox, Send } from 'lucide-react-native';
import { MailboxRole } from '@openmailbox/mail-core';

import { mailboxBadge, mailboxIcon, mailboxName, visibleFolders } from '@/features/mailboxes/mailboxPresentation';
import i18n from '@/utils/i18n';

import { makeMailbox } from '../../helpers/fixtures';

describe('mailbox presentation', () => {
  beforeAll(() => i18n.changeLanguage('en'));

  it('names special folders by role and others by their own name', () => {
    expect(mailboxName(makeMailbox({ name: 'INBOX' }), i18n.t)).toBe('Inbox');
    expect(mailboxName(makeMailbox({ name: 'Envoyés', role: MailboxRole.Sent }), i18n.t)).toBe('Sent');
    expect(mailboxName(makeMailbox({ name: 'Clients', role: undefined }), i18n.t)).toBe('Clients');
  });

  it('gives each role its icon and plain folders a folder icon', () => {
    expect(mailboxIcon(makeMailbox())).toBe(Inbox);
    expect(mailboxIcon(makeMailbox({ role: MailboxRole.Sent }))).toBe(Send);
    expect(mailboxIcon(makeMailbox({ role: undefined }))).toBe(Folder);
  });

  it('counts unread mail, all drafts, and nothing for sent or deleted mail', () => {
    expect(mailboxBadge(makeMailbox({ unreadCount: 4 }))).toBe(4);
    expect(mailboxBadge(makeMailbox({ role: MailboxRole.Drafts, totalCount: 2, unreadCount: 0 }))).toBe(2);
    expect(mailboxBadge(makeMailbox({ role: MailboxRole.Sent, unreadCount: 7 }))).toBe(0);
    expect(mailboxBadge(makeMailbox({ role: MailboxRole.Trash, unreadCount: 7 }))).toBe(0);
  });

  it('hides the subfolders of a collapsed folder, at any depth', () => {
    const folders = [
      makeMailbox({ id: 'inbox' }),
      makeMailbox({ id: 'projects', role: undefined, depth: 0 }),
      makeMailbox({ id: '2025', role: undefined, depth: 1 }),
      makeMailbox({ id: 'q1', role: undefined, depth: 2 }),
      makeMailbox({ id: '2026', role: undefined, depth: 1 }),
      makeMailbox({ id: 'clients', role: undefined, depth: 0 }),
    ];
    const rows = (collapsedIds: string[]) => visibleFolders(folders, collapsedIds).map(({ mailbox, parent }) => `${mailbox.id}${parent ? '+' : ''}`);
    expect(rows([])).toEqual(['inbox', 'projects+', '2025+', 'q1', '2026', 'clients']);
    expect(rows(['2025'])).toEqual(['inbox', 'projects+', '2025+', '2026', 'clients']);
    expect(rows(['projects', '2025'])).toEqual(['inbox', 'projects+', 'clients']);
  });
});
