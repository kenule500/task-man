// Builds the "Copy import" text of a component page from what the page already declares: its source modules and the
// tags used in its code example. Pure, so it is unit tested without rendering the guide.

const unique = <T,>(items: T[]): T[] => [...new Set(items)];

/**
 * `source` lists the modules ("@/components/ui/switch · @/components/ds (SwitchField)"); `code` is the example.
 * Names from the design-system index are imported from it; names of a primitive module are the example's tags that
 * start with the component's name (Select, SelectTrigger, SelectItem...).
 */
export const buildImportStatement = (name: string, source: string, code: string, dsExports: readonly string[]): string => {
  const exported = new Set(dsExports);
  const tags = new Set<string>([...code.matchAll(/<([A-Z][A-Za-z0-9]*)/g)].map(match => match[1]));
  if (/\btoast\b/.test(code)) tags.add('toast');

  const modules = unique([...source.matchAll(/@\/components\/[A-Za-z0-9/-]+/g)].map(match => match[0]));
  const stem = name.split(/\s+/)[0];
  const lines: string[] = [];

  for (const module of modules) {
    const names = module === '@/components/ds'
      ? [...tags].filter(tag => exported.has(tag))
      : [...tags].filter(tag => tag.startsWith(stem) && !exported.has(tag));
    if (names.length > 0) lines.push(`import { ${names.sort().join(', ')} } from '${module}';`);
  }

  if (lines.length === 0) lines.push(`import { ${stem} } from '${modules[0] ?? '@/components/ds'}';`);
  return lines.join('\n');
};
