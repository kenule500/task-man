import * as ds from '@/components/ds';
import { DS_EXPORT_COVERAGE } from '../coverage';
import { DOC_ENTRIES } from '../registry';
import { buildImportStatement } from '../importStatement';
import { DOC_GROUPS, GROUP_INFO, filterEntries, groupEntries, groupHeadingId } from '../search';

describe('documentation coverage', () => {
  const ids = new Set(DOC_ENTRIES.map(entry => entry.id));

  it('has a documentation page, or a stated reason, for every export of components/ds', () => {
    const undocumented = Object.keys(ds).filter(name => !(name in DS_EXPORT_COVERAGE));
    // A new export fails here: add its ComponentDoc to registry.ts, then one line to coverage.ts
    expect(undocumented).toEqual([]);
  });

  it('only names pages that exist in the registry, and no stale exports', () => {
    const missingPages = Object.entries(DS_EXPORT_COVERAGE)
      .filter(([, coverage]) => 'doc' in coverage && !ids.has(coverage.doc))
      .map(([name]) => name);
    expect(missingPages).toEqual([]);
    const stale = Object.keys(DS_EXPORT_COVERAGE).filter(name => !(name in ds));
    expect(stale).toEqual([]);
  });

  it('gives every internal export a reason', () => {
    for (const coverage of Object.values(DS_EXPORT_COVERAGE)) {
      if ('internal' in coverage) expect(coverage.internal.length).toBeGreaterThan(10);
    }
  });

  it('has unique registry ids, and every group has a heading id and a summary', () => {
    expect(ids.size).toBe(DOC_ENTRIES.length);
    for (const group of DOC_GROUPS) {
      expect(GROUP_INFO[group].summary.length).toBeGreaterThan(10);
      expect(groupHeadingId(group)).toBe(`group-${GROUP_INFO[group].slug}`);
    }
  });

  it('documents the new foundations, patterns and components', () => {
    for (const id of ['i18n-rtl', 'contrast-pairs', 'p-dataviz', 'p-chat', 'p-realtime', 'p-ai', 'content-three-languages', 'c-language-switcher']) {
      expect({ id, found: ids.has(id) }).toEqual({ id, found: true });
    }
  });
});

describe('search by props and keywords', () => {
  const entries = [
    { id: 'c-a', group: 'Components' as const, title: 'Alpha', keywords: 'first letter' },
    { id: 'c-b', group: 'Components' as const, title: 'Beta', keywords: 'second' },
  ];

  it('matches prop names next to titles and keywords', () => {
    const props = { 'c-b': 'headingLevel onValueChange' };
    expect(filterEntries(entries, 'headinglevel', props).map(entry => entry.id)).toEqual(['c-b']);
    expect(filterEntries(entries, 'letter', props).map(entry => entry.id)).toEqual(['c-a']);
    expect(filterEntries(entries, 'headinglevel').map(entry => entry.id)).toEqual([]);
    expect(filterEntries(entries, '', props)).toHaveLength(2);
  });

  it('groups in guide order and skips empty groups', () => {
    expect(groupEntries(entries).map(item => item.group)).toEqual(['Components']);
  });
});

describe('copy import statement', () => {
  const exported = Object.keys(ds);

  it('imports design-system names from the index and primitive parts from their module', () => {
    expect(buildImportStatement('Disclosure and Accordion', '@/components/ds', '<Accordion items={items} />\n<Disclosure title="x" />', exported))
      .toBe("import { Accordion, Disclosure } from '@/components/ds';");
    expect(buildImportStatement('Select', '@/components/ui/select', '<Select><SelectTrigger /><SelectContent><SelectItem /></SelectContent></Select>', exported))
      .toBe("import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';");
    expect(buildImportStatement('Switch', '@/components/ui/switch · @/components/ds (SwitchField)', '<SwitchField label="x" />\n<Switch aria-label="y" />', exported))
      .toBe("import { Switch } from '@/components/ui/switch';\nimport { SwitchField } from '@/components/ds';");
    expect(buildImportStatement('Toast', '@/components/ds · toast() + Toaster', 'toast.success("Saved")\n<Toaster />', exported))
      .toBe("import { Toaster, toast } from '@/components/ds';");
  });

  it('falls back to the component name when the example has no tags', () => {
    expect(buildImportStatement('LanguageSwitcher', '@/components/LanguageSwitcher', 'nothing', exported))
      .toBe("import { LanguageSwitcher } from '@/components/LanguageSwitcher';");
  });
});
