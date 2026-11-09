import { MailboxRole } from '@openmailbox/mail-core';

import { availableThreadActions, type ThreadActionContext } from '@/features/threads/threadActions';

const EVERY_FOLDER = new Set([MailboxRole.Inbox, MailboxRole.Archive, MailboxRole.Junk, MailboxRole.Trash, MailboxRole.Sent]);

function actions(overrides: Partial<ThreadActionContext>) {
  return availableThreadActions({ role: MailboxRole.Inbox, accountRoles: EVERY_FOLDER, flagged: false, unread: true, ...overrides });
}

describe('thread actions', () => {
  it('offers the full set in the inbox', () => {
    expect(actions({})).toEqual(['reply', 'replyAll', 'forward', 'delete', 'flag', 'markRead', 'move', 'archive', 'junk']);
  });

  it('follows the flag and read state', () => {
    expect(actions({ flagged: true, unread: false })).toEqual(expect.arrayContaining(['unflag', 'markUnread']));
    expect(actions({ flagged: true, unread: false })).not.toEqual(expect.arrayContaining(['flag']));
  });

  it('brings mail back to the inbox from the trash and the archive', () => {
    for (const role of [MailboxRole.Trash, MailboxRole.Archive, MailboxRole.All]) {
      expect(actions({ role })).toContain('moveToInbox');
      expect(actions({ role })).not.toContain('archive');
    }
  });

  it('says not junk in the junk folder', () => {
    expect(actions({ role: MailboxRole.Junk })).toContain('notJunk');
    expect(actions({ role: MailboxRole.Junk })).not.toContain('junk');
    expect(actions({ role: MailboxRole.Junk })).not.toContain('moveToInbox');
  });

  it('leaves out what the account has no folder for', () => {
    const inboxOnly = new Set([MailboxRole.Inbox]);
    expect(actions({ accountRoles: inboxOnly })).not.toContain('archive');
    expect(actions({ accountRoles: inboxOnly })).not.toContain('junk');
    expect(actions({ accountRoles: new Set([MailboxRole.Inbox, MailboxRole.All]) })).toContain('archive');
  });

  it('does not offer junk for sent mail and drafts', () => {
    expect(actions({ role: MailboxRole.Sent })).not.toContain('junk');
    expect(actions({ role: MailboxRole.Drafts })).not.toContain('junk');
  });
});
