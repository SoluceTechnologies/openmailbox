import type { EmailSummary } from '@openmailbox/mail-core';

import { displayName, withoutAddresses, type MailAddress } from '@/utils/addresses';

export type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward';

export interface ComposePrefill {
  to: MailAddress[];
  cc: MailAddress[];
  subject: string;
  body: string;
}

interface QuoteLabels {
  wrote: (date: string, author: string) => string;
  forwardedHeader: string;
  from: string;
  date: string;
  subject: string;
  to: string;
}

const REPLY_PREFIX = /^(re|aw|réf?)\s*:\s*/i;
const FORWARD_PREFIX = /^(fwd?|tr|wg)\s*:\s*/i;

function prefixed(subject: string, prefix: 'Re' | 'Fwd'): string {
  const pattern = prefix === 'Re' ? REPLY_PREFIX : FORWARD_PREFIX;
  return pattern.test(subject) ? subject : `${prefix}: ${subject}`;
}

function quote(text: string): string {
  return text
    .trimEnd()
    .split('\n')
    .map((line) => (line.startsWith('>') ? `>${line}` : `> ${line}`))
    .join('\n');
}

export function prefill(
  mode: ComposeMode,
  email: EmailSummary,
  originalText: string,
  ownAddresses: string[],
  formattedDate: string,
  labels: QuoteLabels,
): ComposePrefill {
  const subject = email.subject ?? '';
  const author = displayName(email.from[0]);
  if (mode === 'forward') {
    const header = [
      labels.forwardedHeader,
      `${labels.from} ${email.from.map(displayName).join(', ')}`,
      `${labels.date} ${formattedDate}`,
      `${labels.subject} ${subject}`,
      `${labels.to} ${email.to.map(displayName).join(', ')}`,
    ].join('\n');
    return { to: [], cc: [], subject: prefixed(subject, 'Fwd'), body: `\n\n${header}\n\n${originalText}` };
  }
  const sender = email.from.map(({ name, email: address }) => ({ name, email: address }));
  const to = mode === 'replyAll' ? withoutAddresses([...sender, ...email.to], ownAddresses) : sender;
  const cc = mode === 'replyAll' ? withoutAddresses(email.cc, [...ownAddresses, ...to.map((address) => address.email)]) : [];
  return {
    to: to.length > 0 ? to : sender,
    cc,
    subject: prefixed(subject, 'Re'),
    body: `\n\n${labels.wrote(formattedDate, author)}\n${quote(originalText)}`,
  };
}
