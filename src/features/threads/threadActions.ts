import {
  Archive,
  Flag,
  FlagOff,
  Forward,
  FolderInput,
  Inbox,
  Mail,
  MailOpen,
  Reply,
  ReplyAll,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  type LucideIcon,
} from 'lucide-react-native';
import { MailboxRole, type Mailbox, type ThreadSummary } from '@openmailbox/mail-core';

export type ThreadActionId =
  | 'reply'
  | 'replyAll'
  | 'forward'
  | 'delete'
  | 'flag'
  | 'unflag'
  | 'markRead'
  | 'markUnread'
  | 'move'
  | 'archive'
  | 'moveToInbox'
  | 'junk'
  | 'notJunk';

export interface ThreadActionContext {
  role?: MailboxRole;
  accountRoles: Set<MailboxRole>;
  flagged: boolean;
  unread: boolean;
}

const BACK_TO_INBOX: (MailboxRole | undefined)[] = [MailboxRole.Trash, MailboxRole.Archive, MailboxRole.All];
const NEVER_JUNK: (MailboxRole | undefined)[] = [MailboxRole.Junk, MailboxRole.Trash, MailboxRole.Sent, MailboxRole.Drafts];

export function availableThreadActions({ role, accountRoles, flagged, unread }: ThreadActionContext): ThreadActionId[] {
  const actions: ThreadActionId[] = ['reply', 'replyAll', 'forward', 'delete', flagged ? 'unflag' : 'flag', unread ? 'markRead' : 'markUnread', 'move'];
  if (BACK_TO_INBOX.includes(role)) actions.push('moveToInbox');
  else if (role !== MailboxRole.Junk && (accountRoles.has(MailboxRole.Archive) || accountRoles.has(MailboxRole.All))) {
    actions.push('archive');
  }
  if (role === MailboxRole.Junk) actions.push('notJunk');
  else if (!NEVER_JUNK.includes(role) && accountRoles.has(MailboxRole.Junk)) actions.push('junk');
  return actions;
}

export interface MailboxIndex {
  roleOf: Map<string, MailboxRole | undefined>;
  rolesOfAccount: Map<string, Set<MailboxRole>>;
}

export function indexMailboxes(mailboxes: Mailbox[]): MailboxIndex {
  const index: MailboxIndex = { roleOf: new Map(), rolesOfAccount: new Map() };
  for (const mailbox of mailboxes) {
    index.roleOf.set(mailbox.id, mailbox.role);
    let roles = index.rolesOfAccount.get(mailbox.accountId);
    if (!roles) index.rolesOfAccount.set(mailbox.accountId, (roles = new Set()));
    if (mailbox.role !== undefined) roles.add(mailbox.role);
  }
  return index;
}

export function threadActionContext(thread: ThreadSummary, index: MailboxIndex): ThreadActionContext {
  return {
    role: index.roleOf.get(thread.mailboxId),
    accountRoles: index.rolesOfAccount.get(thread.accountId) ?? new Set(),
    flagged: thread.isFlagged,
    unread: thread.unreadCount > 0,
  };
}

export function deletesForGood(context: ThreadActionContext): boolean {
  return context.role === MailboxRole.Trash || !context.accountRoles.has(MailboxRole.Trash);
}

export const THREAD_ACTION_PRESENTATION: Record<ThreadActionId, { label: string; Icon: LucideIcon; destructive?: boolean }> = {
  reply: { label: 'compose.reply', Icon: Reply },
  replyAll: { label: 'compose.replyAll', Icon: ReplyAll },
  forward: { label: 'compose.forward', Icon: Forward },
  delete: { label: 'threads.delete', Icon: Trash2, destructive: true },
  flag: { label: 'threads.flag', Icon: Flag },
  unflag: { label: 'threads.unflag', Icon: FlagOff },
  markRead: { label: 'threads.markRead', Icon: MailOpen },
  markUnread: { label: 'threads.markUnread', Icon: Mail },
  move: { label: 'threads.move', Icon: FolderInput },
  archive: { label: 'threads.archive', Icon: Archive },
  moveToInbox: { label: 'threads.moveToInbox', Icon: Inbox },
  junk: { label: 'threads.junk', Icon: ShieldAlert },
  notJunk: { label: 'threads.notJunk', Icon: ShieldCheck },
};
