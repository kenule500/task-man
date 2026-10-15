import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Toaster } from '@/components/ds';
import DesignSystemPage from '../DesignSystemPage';
import { DOC_ENTRIES } from '../design-system/registry';

// The page is large and getByRole is slow on it: bulk checks use plain DOM queries and
// each test renders it once. Clicks use fireEvent because userEvent takes seconds here
// (longer than a toast lives).
jest.setTimeout(60000);

const renderGuide = () =>
  render(
    <MemoryRouter>
      <DesignSystemPage />
      <Toaster />
    </MemoryRouter>,
  );

const section = (id: string) => document.getElementById(id) as HTMLElement;
const sectionNav = () => screen.getByRole('navigation', { name: 'Sections' });
const navTitles = () => Array.from(sectionNav().querySelectorAll('a')).map(link => link.textContent);
const texts = (parent: ParentNode, selector: string) => Array.from(parent.querySelectorAll(selector)).map(node => node.textContent);

describe('DesignSystemPage (living style guide)', () => {
  it('has the landmarks, every registered section, the component template and unique ids', () => {
    renderGuide();

    // Landmarks and a single h1
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: /taskman design system/i })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
    expect(screen.getByRole('link', { name: /back to app/i })).toHaveAttribute('href', '/');

    // Every registered entry has an h2 with its title and a nav link to it
    const links = Array.from(sectionNav().querySelectorAll('a'));
    for (const entry of DOC_ENTRIES) {
      expect(texts(section(entry.id), 'h2')).toContain(entry.title);
      expect(links.find(link => link.textContent === entry.title)).toHaveAttribute('href', `#${entry.id}`);
    }

    // Required groups and topics are present
    const required = [
      'Overview', 'Principles', 'Changelog', 'Color', 'Typography', 'Spacing', 'Radius', 'Elevation', 'Motion', 'Z-index',
      'Breakpoints', 'Iconography', 'Forms and validation', 'Empty, loading and error states', 'Feedback', 'Navigation',
      'Data views', 'Scrum visuals', 'Mobile and PWA', 'Voice and tone', 'Error messages', 'Button and link labels',
      'Dates and numbers', 'WCAG 2.2 AA checklist',
    ];
    for (const title of required) expect(navTitles()).toContain(title);

    // Every component follows the documentation template
    const components = DOC_ENTRIES.filter(entry => entry.group === 'Components');
    expect(components.length).toBeGreaterThanOrEqual(30);
    for (const entry of components) {
      const root = section(entry.id);
      expect(texts(root, 'h3.uppercase')).toEqual(['Purpose', 'Anatomy', 'Variants', 'States', 'Accessibility', 'Do and don\'t', 'Code', 'Props']);
      expect(root.querySelector('pre code')).not.toBeNull();
      expect(root.querySelector('table caption')?.textContent).toMatch(/props$/i);
      expect(texts(root, 'button').some(label => /^copy/i.test(label ?? ''))).toBe(true);
    }

    // No duplicate ids (anchors, aria-controls and label targets stay unambiguous)
    const ids = Array.from(document.querySelectorAll('[id]')).map(element => element.id);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);

    // Phones get a jump-to-section select with every section
    const select = screen.getByRole('combobox', { name: 'Jump to section' });
    expect(select.querySelectorAll('option')).toHaveLength(DOC_ENTRIES.length);
  });

  it('shows color tokens with computed contrast ratios and a ten-point accessibility checklist', () => {
    renderGuide();
    const color = section('color');
    const names = texts(color, 'p.font-mono');
    expect(names).toContain('--color-primary');
    expect(names).toContain('--color-priority-medium-text');
    expect(Array.from(color.querySelectorAll('span.tabular-nums')).filter(node => /:1$/.test(node.textContent ?? '')).length).toBeGreaterThan(40);
    expect(color).toHaveTextContent('Fail');

    const checks = section('a11y').querySelectorAll('ol > li');
    expect(checks).toHaveLength(10);
    for (const check of Array.from(checks)) expect(check.textContent).toMatch(/Pass|Partial|To audit/);
  });

  it('shows component variants wired for assistive technology', () => {
    renderGuide();
    expect(within(section('c-alert')).getAllByRole('alert')[0]).toHaveTextContent('This dependency would create a cycle.');
    expect(within(section('c-progress-bar')).getByRole('progressbar', { name: /docs progress/i })).toHaveAttribute('aria-valuenow', '100');
    expect(within(section('c-progress-ring')).getAllByRole('progressbar').length).toBeGreaterThanOrEqual(3);
    const invalid = section('c-field').querySelector('input[aria-invalid="true"]') as HTMLInputElement;
    expect(invalid).toHaveAccessibleDescription('Task title is required');
  });

  it('search filters the navigation and the page, finds keywords, and can be cleared', async () => {
    renderGuide();
    const search = screen.getByRole('searchbox', { name: /search sections and components/i });

    fireEvent.change(search, { target: { value: 'kbd' } });
    await screen.findByRole('link', { name: 'Kbd' });
    expect(navTitles()).toEqual(['Kbd']);
    expect(document.getElementById('c-kbd')).not.toBeNull();
    expect(document.getElementById('c-button')).toBeNull();

    fireEvent.change(search, { target: { value: 'burndown' } });
    await screen.findByRole('link', { name: 'Scrum visuals' });
    expect(navTitles()).toEqual(['Scrum visuals']);

    fireEvent.change(search, { target: { value: 'zzzz-nothing' } });
    expect(await screen.findByText(/no sections match/i)).toBeInTheDocument();
    expect(navTitles()).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Show all sections' }));
    expect(await screen.findByRole('link', { name: 'Button' })).toBeInTheDocument();
    expect(screen.queryByText(/no sections match/i)).not.toBeInTheDocument();
    expect(search).toHaveValue('');

    // Escape clears the field
    fireEvent.change(search, { target: { value: 'tabs' } });
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(search).toHaveValue('');
  });

  it('copies code snippets when the clipboard is available and stays safe when it is not', async () => {
    renderGuide();
    const kbd = within(section('c-kbd'));
    const copyButton = kbd.getByRole('button', { name: /^copy/i });

    // No clipboard (insecure context, old browser): nothing happens, no crash
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    fireEvent.click(copyButton);
    expect(kbd.queryByText('Copied')).not.toBeInTheDocument();

    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    fireEvent.click(copyButton);
    expect(await kbd.findByText('Copied')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('<Kbd>'));
  });

  it('keeps the live form pattern accessible: a failed submit focuses the first invalid field', async () => {
    renderGuide();
    const form = within(screen.getByRole('form', { name: 'Create project example' }));
    fireEvent.click(form.getByRole('button', { name: 'Create project' }));
    const name = await form.findByLabelText(/project name/i);
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveFocus();
    expect(name).toHaveAccessibleDescription('Enter a project name.');
    expect(form.getByRole('alert')).toHaveTextContent('Fix 2 fields to continue');
  });

  it('demonstrates toasts, including one with an Undo action', async () => {
    renderGuide();
    fireEvent.click(within(section('c-toast')).getByRole('button', { name: /toast with action/i }));
    expect(await screen.findByText('Task deleted')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('Task restored')).toBeInTheDocument();
  });
});
