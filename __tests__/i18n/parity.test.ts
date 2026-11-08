import de from '@/locales/de.json';
import en from '@/locales/en.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';
import italian from '@/locales/it.json';
import nl from '@/locales/nl.json';
import oc from '@/locales/oc.json';
import pt from '@/locales/pt.json';
import ru from '@/locales/ru.json';

type Messages = Record<string, unknown>;

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const LOCALES: [string, Messages][] = [
  ['fr', fr],
  ['de', de],
  ['es', es],
  ['it', italian],
  ['pt', pt],
  ['nl', nl],
  ['ru', ru],
  ['oc', oc],
];

function entries(messages: Messages, prefix = ''): [string, string][] {
  return Object.entries(messages).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === 'object' ? entries(value as Messages, path) : [[path, String(value)] as [string, string]];
  });
}

function stems(messages: Messages): string[] {
  return [...new Set(entries(messages).map(([path]) => path.replace(PLURAL_SUFFIX, '')))].sort();
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((match) => match[1]).sort();
}

describe('locale files', () => {
  it.each(LOCALES)('%s has the same keys as English', (_code, messages) => {
    expect(stems(messages)).toEqual(stems(en));
  });

  it.each([['en', en] as [string, Messages], ...LOCALES])('%s has no empty message', (_code, messages) => {
    expect(entries(messages).filter(([, text]) => text.trim() === '')).toEqual([]);
  });

  it.each(LOCALES)('%s keeps the placeholders of every English message', (_code, messages) => {
    const english = new Map(entries(en).map(([path, text]) => [path.replace(PLURAL_SUFFIX, ''), placeholders(text)]));
    for (const [path, text] of entries(messages)) {
      const expected = english.get(path.replace(PLURAL_SUFFIX, ''))!.filter((name) => name !== 'count');
      expect([path, placeholders(text).filter((name) => name !== 'count')]).toEqual([path, expected]);
    }
  });

  it('gives Russian its four plural forms', () => {
    const plurals = entries(en)
      .map(([path]) => path)
      .filter((path) => path.endsWith('_other'))
      .map((path) => path.replace(/_other$/, ''));
    const russian = new Set(entries(ru).map(([path]) => path));
    for (const stem of plurals) {
      for (const form of ['one', 'few', 'many', 'other']) expect(russian).toContain(`${stem}_${form}`);
    }
  });
});
