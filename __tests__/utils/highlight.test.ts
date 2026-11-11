import { highlightParts, snippetAround } from '@/utils/highlight';

describe('highlightParts', () => {
  it('highlights whole words starting with a searched word, ignoring case and accents', () => {
    expect(highlightParts('Test 2 — testing the Été plan', 'tes ete')).toEqual([
      { text: 'Test', match: true },
      { text: ' 2 — ', match: false },
      { text: 'testing', match: true },
      { text: ' the ', match: false },
      { text: 'Été', match: true },
      { text: ' plan', match: false },
    ]);
  });

  it('leaves words matching inside, not at their start', () => {
    expect(highlightParts('contest', 'test')).toEqual([{ text: 'contest', match: false }]);
  });
});

describe('snippetAround', () => {
  it('starts shortly before a match far in the text', () => {
    const text = `${'mot '.repeat(30)}la facture est jointe`;
    expect(snippetAround(text, 'facture', 10)).toBe('…mot mot la facture est jointe');
  });

  it('keeps a text whose match is near its start', () => {
    expect(snippetAround('Votre facture', 'facture')).toBe('Votre facture');
  });
});
