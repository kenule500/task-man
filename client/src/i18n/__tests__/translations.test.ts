import { NAMESPACES, resources } from '../resources';

// Every key written in English must exist in French and Arabic, with the same {{placeholders}} and <tags>.
// A missing translation fails here instead of showing English text (or a raw key) to French and Arabic users.

type Tree = { [key: string]: string | Tree };

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const PLURAL_FORMS = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;

const flatten = (tree: Tree, prefix = ''): Record<string, string> =>
  Object.entries(tree).reduce<Record<string, string>>((out, [key, value]) => {
    if (typeof value === 'string') out[prefix + key] = value;
    else Object.assign(out, flatten(value, `${prefix}${key}.`));
    return out;
  }, {});

const placeholders = (text: string): string[] => [...new Set((text.match(/\{\{\s*[\w.]+\s*\}\}/g) ?? []).map((item) => item.replace(/\s/g, '')))].sort();
const tags = (text: string): string[] => [...new Set((text.match(/<\/?[a-z][a-z0-9]*>/gi) ?? []))].sort();

/** Plural forms a language needs. English and French fall back to `_other` for the rare forms. */
const requiredForms = (language: string): readonly string[] =>
  language === 'ar' ? PLURAL_FORMS : ['one', 'other'];

const namespaceOf = (language: 'en' | 'fr' | 'ar', namespace: string): Record<string, string> =>
  flatten(((resources[language] as Record<string, unknown>)[namespace] ?? {}) as Tree);

/** `{ 'a.b': ['one','other'] }` for plural keys, `{ 'a.c': null }` for plain keys. */
const shape = (flat: Record<string, string>): Map<string, string[] | null> => {
  const result = new Map<string, string[] | null>();
  for (const key of Object.keys(flat)) {
    const match = key.match(PLURAL_SUFFIX);
    if (!match) {
      result.set(key, null);
      continue;
    }
    const base = key.replace(PLURAL_SUFFIX, '');
    const forms = result.get(base) ?? [];
    forms.push(match[1]);
    result.set(base, forms);
  }
  return result;
};

describe.each(NAMESPACES)('translations: %s', (namespace) => {
  const english = namespaceOf('en', namespace);
  const englishShape = shape(english);

  describe.each(['fr', 'ar'] as const)('%s', (language) => {
    const translated = namespaceOf(language, namespace);
    const translatedShape = shape(translated);

    it('has every English key', () => {
      const missing: string[] = [];
      for (const [base, forms] of englishShape) {
        if (forms === null) {
          if (!(base in translated)) missing.push(base);
          continue;
        }
        const have = translatedShape.get(base) ?? [];
        for (const form of requiredForms(language)) {
          if (!have.includes(form)) missing.push(`${base}_${form}`);
        }
      }
      expect(missing).toEqual([]);
    });

    it('has no key that English does not have', () => {
      const extra = [...translatedShape.keys()].filter((key) => !englishShape.has(key));
      expect(extra).toEqual([]);
    });

    it('keeps the same placeholders and tags as English', () => {
      const mismatched: string[] = [];
      for (const [base, forms] of englishShape) {
        // Plural keys: compare the "other" form, the one every language has
        const key = forms === null ? base : `${base}_other`;
        if (!(key in translated) || !(key in english)) continue;
        if (placeholders(english[key]).join() !== placeholders(translated[key]).join()) mismatched.push(`${key} placeholders`);
        if (tags(english[key]).join() !== tags(translated[key]).join()) mismatched.push(`${key} tags`);
      }
      expect(mismatched).toEqual([]);
    });

    it('has no empty text', () => {
      const empty = Object.entries(translated).filter(([, text]) => text.trim() === '').map(([key]) => key);
      expect(empty).toEqual([]);
    });
  });
});
