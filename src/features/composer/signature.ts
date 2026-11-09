/** The usual signature delimiter, which mail clients recognise to trim signatures from quotes. */
export const SIGNATURE_SEPARATOR = '-- ';

function block(signature: string): string {
  return signature.trim() ? `\n\n${SIGNATURE_SEPARATOR}\n${signature}` : '';
}

/** Adds the signature at the end of what the user writes, above any quoted text, which starts with a blank line. */
export function withSignature(body: string, signature: string): string {
  return block(signature) + body;
}

/**
 * Swaps the signature when the sending account changes. Returns null when the user edited the
 * previous signature, which is then left alone. A new signature goes above `quote`, the quoted
 * text of a reply or forward, or at the end of the message.
 */
export function replaceSignature(body: string, previous: string, next: string, quote = ''): string | null {
  const previousBlock = block(previous);
  if (previousBlock) {
    const start = body.indexOf(previousBlock);
    const after = start === -1 ? null : body.slice(start + previousBlock.length);
    if (after === null || (after !== '' && !after.startsWith('\n\n'))) return null;
    return body.slice(0, start) + block(next) + after;
  }
  const quoteStart = quote ? body.lastIndexOf(quote) : -1;
  return quoteStart === -1 ? body + block(next) : body.slice(0, quoteStart) + block(next) + body.slice(quoteStart);
}
