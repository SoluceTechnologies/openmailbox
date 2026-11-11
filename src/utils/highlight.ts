function fold(character: string): string {
  return character.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const WORD_CHARACTER = /[\p{L}\p{N}]/u;

function terms(query: string): string[] {
  return query
    .split(/\s+/)
    .map((term) => [...term].map(fold).join(''))
    .filter(Boolean);
}

export function highlightParts(text: string, query: string): { text: string; match: boolean }[] {
  const wanted = terms(query);
  if (wanted.length === 0 || !text) return text ? [{ text, match: false }] : [];
  const characters = [...text];
  const parts: { text: string; match: boolean }[] = [];
  let plain = '';
  let index = 0;
  while (index < characters.length) {
    const startsWord = WORD_CHARACTER.test(characters[index]) && (index === 0 || !WORD_CHARACTER.test(characters[index - 1]));
    if (startsWord) {
      let end = index;
      while (end < characters.length && WORD_CHARACTER.test(characters[end])) end += 1;
      const word = characters.slice(index, end);
      const folded = word.map(fold).join('');
      if (wanted.some((term) => folded.startsWith(term))) {
        if (plain) parts.push({ text: plain, match: false });
        plain = '';
        parts.push({ text: word.join(''), match: true });
        index = end;
        continue;
      }
    }
    plain += characters[index];
    index += 1;
  }
  if (plain) parts.push({ text: plain, match: false });
  return parts;
}

export function snippetAround(text: string, query: string, lead = 40): string {
  const parts = highlightParts(text, query);
  let offset = 0;
  for (const part of parts) {
    if (part.match) break;
    offset += part.text.length;
  }
  if (offset <= lead || offset >= text.length) return text;
  const start = text.lastIndexOf(' ', offset - lead);
  return `…${text.slice(start === -1 ? offset - lead : start + 1)}`;
}
