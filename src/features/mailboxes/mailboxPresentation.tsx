import { Archive, File, Folder, Inbox, Mails, Send, ShieldAlert, Star, Trash2, type LucideIcon } from 'lucide-react-native';
import { MailboxRole, type Mailbox } from '@openmailbox/mail-core';
import type { TFunction } from 'i18next';

const ROLE_ICONS: Record<MailboxRole, LucideIcon> = {
  [MailboxRole.Inbox]: Inbox,
  [MailboxRole.Sent]: Send,
  [MailboxRole.Drafts]: File,
  [MailboxRole.Trash]: Trash2,
  [MailboxRole.Junk]: ShieldAlert,
  [MailboxRole.Archive]: Archive,
  [MailboxRole.All]: Mails,
  [MailboxRole.Flagged]: Star,
};

const ROLE_LABELS: Record<MailboxRole, string> = {
  [MailboxRole.Inbox]: 'mailboxes.roles.inbox',
  [MailboxRole.Sent]: 'mailboxes.roles.sent',
  [MailboxRole.Drafts]: 'mailboxes.roles.drafts',
  [MailboxRole.Trash]: 'mailboxes.roles.trash',
  [MailboxRole.Junk]: 'mailboxes.roles.junk',
  [MailboxRole.Archive]: 'mailboxes.roles.archive',
  [MailboxRole.All]: 'mailboxes.roles.all',
  [MailboxRole.Flagged]: 'mailboxes.roles.flagged',
};

export function mailboxIcon(mailbox: Mailbox): LucideIcon {
  return mailbox.role === undefined ? Folder : ROLE_ICONS[mailbox.role];
}

export function mailboxName(mailbox: Mailbox, t: TFunction): string {
  return mailbox.role === undefined ? mailbox.name : t(ROLE_LABELS[mailbox.role]);
}

export interface FolderRow {
  mailbox: Mailbox;
  parent: boolean;
}

export function visibleFolders(mailboxes: Mailbox[], collapsedIds: string[]): FolderRow[] {
  const rows: FolderRow[] = [];
  let hiddenBelow = Infinity;
  mailboxes.forEach((mailbox, index) => {
    if (mailbox.depth > hiddenBelow) return;
    hiddenBelow = collapsedIds.includes(mailbox.id) ? mailbox.depth : Infinity;
    rows.push({ mailbox, parent: (mailboxes[index + 1]?.depth ?? 0) > mailbox.depth });
  });
  return rows;
}

export function mailboxBadge(mailbox: Mailbox): number {
  if (mailbox.role === MailboxRole.Drafts) return mailbox.totalCount;
  if (mailbox.role === MailboxRole.Sent || mailbox.role === MailboxRole.Trash || mailbox.role === MailboxRole.All) return 0;
  return mailbox.unreadCount;
}
