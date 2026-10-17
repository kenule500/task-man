import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { setThemePreference } from '@/lib/theme';
import DesignSystemPage from '../DesignSystemPage';
import { DOC_ENTRIES } from '../design-system/registry';
import { DOC_GROUPS, groupHeadingId } from '../design-system/search';

// Structure and guide controls: group headings, the heading outline, the preview toggles, the "On this page" rail,
// anchors, "Copy import" and search by prop. Each test renders the whole guide once (it is large).
jest.setTimeout(90000);

const renderGuide = () => render(<MemoryRouter><DesignSystemPage /></MemoryRouter>);
const section = (id: string) => document.getElementById(id) as HTMLElement;
const levelOf = (heading: Element) => Number(heading.tagName[1]);
const NEGATIVE_MARGIN = /(^|\s)-m[btlrxyse]?-/;

describe('guide structure', () => {
  it('gives every group a real heading with its own space, and keeps demo headings out of the outline', () => {
    renderGuide();
    const main = screen.getByRole('main');

    // Each group is a header (eyebrow, h2, summary) followed by its sections: nothing is pulled up with a negative margin
    const groups = Array.from(main.querySelectorAll('[data-doc-group]'));
    expect(groups).toHaveLength(DOC_GROUPS.length);
    for (const group of groups) {
      const header = group.querySelector(':scope > header') as HTMLElement;
      const h2 = header.querySelector('h2') as HTMLElement;
      expect(h2.id).toMatch(/^group-/);
      expect(DOC_GROUPS.map(groupHeadingId)).toContain(h2.id);
      const label = header.querySelector('p') as HTMLElement;
      for (const element of [group, header, label, h2, header.querySelector('p:last-of-type') as HTMLElement]) {
        expect({ tag: element.tagName, negative: NEGATIVE_MARGIN.test(element.className) }).toEqual({ tag: element.tagName, negative: false });
      }
      expect(label).not.toHaveAttribute('aria-hidden');
      expect(label.textContent).toMatch(/Part \d of 6/);
      // The first section title comes after the heading block in the DOM
      const firstTitle = group.querySelector('[data-doc-section] h3') as HTMLElement;
      expect(header.compareDocumentPosition(firstTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      for (const sectionElement of Array.from(group.querySelectorAll('[data-doc-section]'))) {
        expect(NEGATIVE_MARGIN.test(sectionElement.className)).toBe(false);
      }
    }

    // Outline: one h1, an h2 per group, one h3 per section; demo headings are h5 or lower and sit inside [data-demo]
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    expect(headings.filter(heading => levelOf(heading) === 1)).toHaveLength(1);
    expect(headings.filter(heading => levelOf(heading) === 2).map(heading => heading.id)).toEqual(DOC_GROUPS.map(groupHeadingId));
    for (const entry of DOC_ENTRIES) {
      const titles = Array.from(section(entry.id).querySelectorAll('h3')).filter(heading => !heading.closest('[data-demo]'));
      expect({ id: entry.id, titles: titles.map(heading => heading.textContent) }).toEqual({ id: entry.id, titles: [entry.title] });
    }
    const offenders = headings.filter(heading => {
      const inDemo = Boolean(heading.closest('[data-demo]'));
      const level = levelOf(heading);
      return inDemo ? level < 5 : level >= 5;
    }).map(heading => `${heading.tagName} ${heading.textContent}`);
    expect(offenders).toEqual([]);
  });

  it('reads a section count after its title, not glued to it', () => {
    renderGuide();
    const header = within(section('c-section-header')).getAllByRole('heading', { level: 5 }).find(heading => /^Due this week/.test(heading.textContent ?? ''))!;
    expect(header).toHaveTextContent('Due this week, 3');
    expect(screen.queryAllByRole('heading').some(heading => /week3/.test(heading.textContent ?? ''))).toBe(false);
  });

  it('adds deep links to group, section and component headings, and an On this page rail for the active section', () => {
    renderGuide();
    expect(within(section('overview')).getByRole('link', { name: 'Link to Overview' })).toHaveAttribute('href', '#overview');
    expect(within(section('c-button')).getByRole('link', { name: 'Link to Button' })).toHaveAttribute('href', '#c-button');
    expect(screen.getByRole('link', { name: 'Foundations' })).toHaveAttribute('href', '#group-foundations');

    // The rail lists the sub-headings of the section being read and links to them
    fireEvent.change(screen.getByRole('combobox', { name: 'Jump to section' }), { target: { value: 'c-button' } });
    const rail = screen.getByRole('navigation', { name: 'On this page' });
    const labels = Array.from(rail.querySelectorAll('a')).map(link => link.textContent);
    expect(labels).toEqual(['Purpose', 'Anatomy', 'Variants', 'States', 'Accessibility', 'Do and don\'t', 'Code', 'Props']);
    for (const link of Array.from(rail.querySelectorAll('a'))) {
      expect(document.getElementById(link.getAttribute('href')!.slice(1))).not.toBeNull();
    }
  });
});

describe('guide controls', () => {
  afterEach(() => setThemePreference('light'));

  it('previews specimens in French and Arabic (right to left) without changing the guide itself', () => {
    renderGuide();
    const group = screen.getByRole('radiogroup', { name: 'Specimen language' });
    const probe = () => section('i18n-rtl').querySelector('[data-demo]') as HTMLElement;

    expect(probe()).toHaveAttribute('dir', 'ltr');
    expect(probe()).toHaveTextContent('Website v1');

    fireEvent.click(within(group).getByRole('radio', { name: 'Français' }));
    expect(probe()).toHaveAttribute('lang', 'fr');
    expect(probe()).toHaveAttribute('dir', 'ltr');
    expect(probe()).toHaveTextContent('Site web v1');

    fireEvent.click(within(group).getByRole('radio', { name: 'العربية' }));
    expect(within(group).getByRole('radio', { name: 'العربية' })).toBeChecked();
    expect(probe()).toHaveAttribute('lang', 'ar');
    expect(probe()).toHaveAttribute('dir', 'rtl');
    expect(probe()).toHaveTextContent('الموقع الإلكتروني v1');
    // Every example area follows; the documentation around it stays English and left to right
    const areas = Array.from(document.querySelectorAll('[data-demo]'));
    expect(areas.length).toBeGreaterThan(50);
    expect(areas.every(area => area.getAttribute('dir') === 'rtl')).toBe(true);
    expect(document.documentElement.getAttribute('dir')).not.toBe('rtl');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('TaskMan design system');
    // Components translate in place: the chat typing indicator reads Arabic
    expect(section('p-realtime')).toHaveTextContent(/يكتب/);

    fireEvent.click(within(group).getByRole('radio', { name: 'English' }));
    expect(probe()).toHaveAttribute('dir', 'ltr');
  });

  it('switches the theme between light and dark', () => {
    renderGuide();
    const group = screen.getByRole('radiogroup', { name: 'Guide theme' });
    fireEvent.click(within(group).getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(within(group).getByRole('radio', { name: 'Dark' })).toBeChecked();
    fireEvent.click(within(group).getByRole('radio', { name: 'Light' }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('copies the import statement of a component page', async () => {
    renderGuide();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const button = within(section('c-kbd')).getByRole('button', { name: /copy import statement for kbd/i });
    fireEvent.click(button);
    expect(await within(section('c-kbd')).findByText('Copied')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith("import { Kbd } from '@/components/ds';");

    // Primitive pages import from their own module
    fireEvent.click(within(section('c-select')).getByRole('button', { name: /copy import statement/i }));
    expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining("from '@/components/ui/select';"));
  });

  it('finds components by prop name as well as by title and keyword', async () => {
    renderGuide();
    const search = screen.getByRole('searchbox', { name: /search sections and components/i });
    fireEvent.change(search, { target: { value: 'headingLevel' } });
    await screen.findByRole('link', { name: 'SectionHeader' });
    const titles = Array.from(screen.getByRole('navigation', { name: 'Sections' }).querySelectorAll('ul a')).map(link => link.textContent);
    expect(titles).toEqual(expect.arrayContaining(['PageHeader', 'SectionHeader', 'ErrorState', 'EmptyState']));
    expect(titles).not.toContain('Kbd');
  });
});
