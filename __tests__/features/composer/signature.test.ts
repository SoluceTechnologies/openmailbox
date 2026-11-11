import { replaceSignature, SIGNATURE_SEPARATOR, withSignature } from '@/features/composer/signature';

const REPLY = '\n\nOn 9 November 2026, Claire wrote:\n> Bonjour';

describe('signatures', () => {
  it('uses the standard separator', () => {
    expect(SIGNATURE_SEPARATOR).toBe('-- ');
  });

  it('ends a new message with the signature after a blank line', () => {
    expect(withSignature('', 'Charles')).toBe('\n\n-- \nCharles');
  });

  it('puts the signature above the quoted text of a reply', () => {
    expect(withSignature(REPLY, 'Charles\nSoluce Technologies')).toBe(
      '\n\n-- \nCharles\nSoluce Technologies\n\nOn 9 November 2026, Claire wrote:\n> Bonjour',
    );
  });

  it('adds nothing without a signature', () => {
    expect(withSignature(REPLY, '  ')).toBe(REPLY);
  });

  it('swaps a signature the user left alone', () => {
    const body = `Merci !${withSignature(REPLY, 'Charles')}`;
    expect(replaceSignature(body, 'Charles', 'C. Gauthereau')).toBe(`Merci !${withSignature(REPLY, 'C. Gauthereau')}`);
    expect(replaceSignature(body, 'Charles', '')).toBe(`Merci !${REPLY}`);
  });

  it('adds a signature where there was none', () => {
    expect(replaceSignature(`Merci !${REPLY}`, '', 'Charles', REPLY)).toBe(`Merci !${withSignature(REPLY, 'Charles')}`);
    expect(replaceSignature('Merci !', '', 'Charles')).toBe('Merci !\n\n-- \nCharles');
  });

  it('adds a missing signature after every paragraph the user wrote', () => {
    expect(replaceSignature('Bonjour,\n\nÀ demain.', '', 'Charles')).toBe('Bonjour,\n\nÀ demain.\n\n-- \nCharles');
    expect(replaceSignature(`Bonjour,\n\nÀ demain.${REPLY}`, '', 'Charles', REPLY)).toBe(
      `Bonjour,\n\nÀ demain.${withSignature(REPLY, 'Charles')}`,
    );
  });

  it('leaves an edited signature alone', () => {
    expect(replaceSignature('Merci !\n\n-- \nCharles G.', 'Charles', 'Bob')).toBeNull();
  });
});
