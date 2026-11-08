const LINE_LENGTH = 76;

function encodeWord(text) {
  return /^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

export function formatAddress({ name, email }) {
  return name ? `${encodeWord(name)} <${email}>` : email;
}

function base64Lines(content) {
  const encoded = Buffer.from(content).toString('base64');
  return encoded.match(new RegExp(`.{1,${LINE_LENGTH}}`, 'g'))?.join('\r\n') ?? '';
}

function leaf({ type, content, filename, contentId, inline }) {
  const headers = [`Content-Type: ${type}${filename ? `; name="${filename}"` : ''}`, 'Content-Transfer-Encoding: base64'];
  if (filename) headers.push(`Content-Disposition: ${inline ? 'inline' : 'attachment'}; filename="${filename}"`);
  if (contentId) headers.push(`Content-ID: <${contentId}>`);
  return `${headers.join('\r\n')}\r\n\r\n${base64Lines(content)}`;
}

let boundaryCounter = 0;

function multipart(subtype, parts) {
  const boundary = `=_openmailbox_${(boundaryCounter += 1).toString(36)}`;
  const body = parts.map((part) => `--${boundary}\r\n${part}`).join('\r\n');
  return `Content-Type: multipart/${subtype}; boundary="${boundary}"\r\n\r\n${body}\r\n--${boundary}--`;
}

export function buildMessage({ from, to, cc = [], subject, date, messageId, inReplyTo, references = [], text, html, inlineImages = [], attachments = [] }) {
  const textPart = leaf({ type: 'text/plain; charset=utf-8', content: text });
  let body = textPart;
  if (html) {
    const htmlPart = leaf({ type: 'text/html; charset=utf-8', content: html });
    const related = inlineImages.length > 0
      ? multipart('related', [htmlPart, ...inlineImages.map((image) => leaf({ ...image, inline: true }))])
      : htmlPart;
    body = multipart('alternative', [textPart, related]);
  }
  if (attachments.length > 0) body = multipart('mixed', [body, ...attachments.map((attachment) => leaf(attachment))]);

  const headers = [
    `From: ${formatAddress(from)}`,
    `To: ${to.map(formatAddress).join(', ')}`,
    ...(cc.length > 0 ? [`Cc: ${cc.map(formatAddress).join(', ')}`] : []),
    `Subject: ${encodeWord(subject)}`,
    `Date: ${date.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${messageId}>`,
    ...(inReplyTo ? [`In-Reply-To: <${inReplyTo}>`] : []),
    ...(references.length > 0 ? [`References: ${references.map((id) => `<${id}>`).join(' ')}`] : []),
    'MIME-Version: 1.0',
  ];
  return `${headers.join('\r\n')}\r\n${body}\r\n`;
}
