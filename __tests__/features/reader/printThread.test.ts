import type { EmailSummary, RenderedBody } from '@openmailbox/mail-core';

import { threadPrintHtml } from '@/features/reader/printThread';

function email(overrides: Partial<EmailSummary>): EmailSummary {
  return {
    id: 'email-1',
    accountId: 'account-1',
    threadId: 'thread-1',
    subject: 'Hello',
    from: [{ name: 'Ada', email: 'ada@example.com' }],
    to: [{ email: 'bob@example.com' }],
    cc: [],
    receivedAt: 0,
    isSeen: true,
    isFlagged: false,
    isAnswered: false,
    hasAttachment: false,
    ...overrides,
  };
}

function body(overrides: Partial<RenderedBody>): RenderedBody {
  return { text: '', bcc: [], hasRemoteContent: false, attachments: [], ...overrides };
}

describe('threadPrintHtml', () => {
  it('escapes headers and text-only bodies', () => {
    const html = threadPrintHtml([email({ subject: 'A <b> & co' })], [body({ text: 'x <script> y' })], false);
    expect(html).toContain('A &lt;b&gt; &amp; co');
    expect(html).toContain('x &lt;script&gt; y');
    expect(html).not.toContain('<script>');
  });

  it('keeps html bodies as markup', () => {
    expect(threadPrintHtml([email({})], [body({ html: '<p><b>Bold</b></p>', text: 'Bold' })], false)).toContain('<p><b>Bold</b></p>');
  });

  it('blocks remote images unless allowed', () => {
    expect(threadPrintHtml([email({})], [body({ text: 'a' })], false)).toContain('img-src data:;');
    expect(threadPrintHtml([email({})], [body({ text: 'a' })], true)).toContain('img-src data: https: http:;');
  });

  it('prints every message in the given order', () => {
    const html = threadPrintHtml(
      [email({ id: 'a', subject: 'First' }), email({ id: 'b', subject: 'Second' })],
      [body({ text: 'one' }), body({ text: 'two' })],
      false,
    );
    expect(html.indexOf('one')).toBeLessThan(html.indexOf('two'));
    expect(html).toContain('ada@example.com');
    expect(html).toContain('bob@example.com');
  });
});
