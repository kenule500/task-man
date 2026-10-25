import en from '@/i18n/locales/en/aiPlan.json';
import fr from '@/i18n/locales/fr/aiPlan.json';
import ar from '@/i18n/locales/ar/aiPlan.json';

type Tree = { [key: string]: string | Tree };

// "updated_one", "updated_other"... are the plural forms of one key
const PLURAL = /_(zero|one|two|few|many|other)$/;

const paths = (tree: Tree, prefix = ''): string[] =>
  Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${prefix}${key.replace(PLURAL, '')}`] : paths(value, `${prefix}${key}.`));

const placeholders = (text: string): string[] => [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map(match => match[1]).sort();

const flat = (tree: Tree, prefix = ''): Record<string, string> =>
  Object.fromEntries(Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [[`${prefix}${key}`, value]] : Object.entries(flat(value, `${prefix}${key}.`))));

describe('aiPlan translations', () => {
  const base = [...new Set(paths(en as Tree))].sort();

  it.each([['fr', fr], ['ar', ar]] as const)('TEST-047 AC-011: %s has every key of English and no extra', (_name, tree) => {
    expect([...new Set(paths(tree as Tree))].sort()).toEqual(base);
  });

  it.each([['fr', fr], ['ar', ar]] as const)('AC-011: %s keeps the placeholders of the English text', (_name, tree) => {
    const english = flat(en as Tree);
    // Plural forms may spell a number out instead of using {{count}}, so only the other placeholders are compared
    const named = (text: string) => placeholders(text).filter(name => name !== 'count');
    for (const [key, text] of Object.entries(flat(tree as Tree))) {
      const source = english[key] ?? english[key.replace(PLURAL, '_other')];
      if (source) expect({ key, found: named(text) }).toEqual({ key, found: named(source) });
    }
  });
});
