import {
  MailboxRole,
  Security,
  type Account,
  type EmailSummary,
  type Mailbox,
  type MailCoreLike,
  type ThreadSummary,
} from '@openmailbox/mail-core';

import { mailCore } from '@/core/mailCore';

export const core = mailCore() as jest.Mocked<MailCoreLike>;

const DAY = 24 * 60 * 60 * 1000;
export const NOW = Date.UTC(2026, 10, 6, 10, 30);

export function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'account-1',
    email: 'alice@example.com',
    displayName: 'Alice Martin',
    username: 'alice@example.com',
    imap: { host: 'imap.example.com', port: 993, security: Security.Tls },
    smtp: { host: 'smtp.example.com', port: 465, security: Security.Tls },
    color: 0,
    ...overrides,
  };
}

export function makeMailbox(overrides: Partial<Mailbox> = {}): Mailbox {
  return {
    id: 'mailbox-inbox',
    accountId: 'account-1',
    name: 'INBOX',
    depth: 0,
    role: MailboxRole.Inbox,
    selectable: true,
    totalCount: 12,
    unreadCount: 3,
    ...overrides,
  };
}

export function makeEmail(overrides: Partial<EmailSummary> = {}): EmailSummary {
  return {
    id: 'email-1',
    accountId: 'account-1',
    threadId: 'thread-1',
    subject: 'Lancement du projet Atlas',
    from: [{ name: 'Claire Dubois', email: 'claire@atlas.example' }],
    to: [{ name: 'Alice Martin', email: 'alice@example.com' }],
    cc: [],
    preview: "Voici l'ordre du jour de jeudi.",
    receivedAt: NOW - DAY / 4,
    isSeen: false,
    isFlagged: false,
    isAnswered: false,
    hasAttachment: false,
    ...overrides,
  };
}

export function makeThread(overrides: Partial<ThreadSummary> = {}): ThreadSummary {
  const latest = overrides.latest ?? makeEmail();
  return {
    key: `mailbox-inbox:${latest.threadId}`,
    threadId: latest.threadId,
    mailboxId: 'mailbox-inbox',
    accountId: latest.accountId,
    latest,
    messageCount: 1,
    unreadCount: latest.isSeen ? 0 : 1,
    isFlagged: latest.isFlagged,
    hasAttachment: latest.hasAttachment,
    lastReceivedAt: latest.receivedAt,
    ...overrides,
  };
}
