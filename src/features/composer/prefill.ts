import type { EmailSummary } from '@openmailbox/mail-core';

import { displayName, parseAddressList, withoutAddresses, type MailAddress } from '@/utils/addresses';
import { splitLinks } from '@/utils/links';

export type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward';

export function composeTitleKey(mode: ComposeMode = 'new'): string {
  return mode === 'new' ? 'compose.newMessage' : mode === 'forward' ? 'compose.forward' : 'compose.reply';
}

export interface ComposePrefill {
  to: MailAddress[];
  cc: MailAddress[];
  subject: string;
  body: string;
}

export const MAILTO = /^mailto:/i;

const decode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export function parseMailto(url: string): ComposePrefill & { bcc: MailAddress[] } {
  const rest = url.replace(MAILTO, '');
  const split = rest.indexOf('?');
  const fields: Record<string, string[]> = { to: [decode(split === -1 ? rest : rest.slice(0, split))] };
  for (const pair of split === -1 ? [] : rest.slice(split + 1).split('&')) {
    const equals = pair.indexOf('=');
    const name = decode(equals === -1 ? pair : pair.slice(0, equals)).toLowerCase();
    (fields[name] ??= []).push(equals === -1 ? '' : decode(pair.slice(equals + 1)));
  }
  const addresses = (name: string) => parseAddressList((fields[name] ?? []).join(',')).addresses;
  return {
    to: addresses('to'),
    cc: addresses('cc'),
    bcc: addresses('bcc'),
    subject: fields.subject?.[0] ?? '',
    body: (fields.body?.[0] ?? '').replace(/\r\n?/g, '\n'),
  };
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

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function textToHtml(text: string): string {
  return escapeHtml(text).replace(/\n/g, '<br>');
}

export function linkedHtml(text: string): string {
  return splitLinks(text)
    .map(({ text: part, url }) => (url ? `<a href="${escapeHtml(url)}">${escapeHtml(part)}</a>` : escapeHtml(part)))
    .join('')
    .replace(/\n/g, '<br>');
}

export function linkedParagraphs(text: string): string {
  return text
    .split('\n')
    .map((line) => (line ? `<p>${linkedHtml(line)}</p>` : '<br>'))
    .join('');
}

export function quoteHtml(mode: ComposeMode, quoteText: string, originalHtml: string): string {
  const quote = quoteText.trim();
  if (mode === 'forward') return `<br><br><div>${textToHtml(quote.split('\n\n')[0])}</div><br>${originalHtml}`;
  const attribution = textToHtml(quote.split('\n')[0]);
  return `<br><br><div>${attribution}</div><blockquote type="cite" style="margin:0 0 0 .8ex;border-left:2px solid #c4c4c4;padding-left:1ex">${originalHtml}</blockquote>`;
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
  const sentByUser = sender.length > 0 && withoutAddresses(sender, ownAddresses).length === 0;
  const recipients = sentByUser ? withoutAddresses(email.to, ownAddresses) : sender;
  const to = mode === 'replyAll' ? withoutAddresses([...recipients, ...email.to], ownAddresses) : recipients;
  const cc = mode === 'replyAll' ? withoutAddresses(email.cc, [...ownAddresses, ...to.map((address) => address.email)]) : [];
  return {
    to: to.length > 0 ? to : sender,
    cc,
    subject: prefixed(subject, 'Re'),
    body: `\n\n${labels.wrote(formattedDate, author)}\n${quote(originalText)}`,
  };
}
