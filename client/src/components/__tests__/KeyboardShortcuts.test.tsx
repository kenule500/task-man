import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { PermissionContext } from '@/context/PermissionContext';
import type { PermissionContextValue } from '@/context/permissionTypes';
import KeyboardShortcuts from '../KeyboardShortcuts';
import { GO_SEQUENCE_MS, isOverlayOpen, isTextEntryTarget, shortcutGroups } from '../shortcuts';

jest.setTimeout(30000);

const permissionValue = (granted: string[]): PermissionContextValue => ({
  user: null,
  workspace: null,
  role: null,
  permissions: granted,
  actions: [],
  loading: false,
  error: null,
  can: permission => granted.includes(permission),
  hasRole: () => false,
  refresh: async () => undefined,
});

const Where = () => {
  const location = useLocation();
  return <output data-testid="where">{location.pathname + location.search}</output>;
};

const ALL = ['tasks:read', 'tasks:write', 'projects:read', 'reports:read'];

const renderShortcuts = (granted: string[] = ALL, extra?: React.ReactNode) =>
  render(
    <PermissionContext.Provider value={permissionValue(granted)}>
      <MemoryRouter initialEntries={['/acme/dashboard']}>
        <Routes>
          <Route path="*" element={<><KeyboardShortcuts slug="acme" /><Where />{extra}</>} />
        </Routes>
      </MemoryRouter>
    </PermissionContext.Provider>,
  );

const press = (key: string, init: KeyboardEventInit = {}, target: Element = document.body) =>
  fireEvent.keyDown(target, { key, ...init });
const where = () => screen.getByTestId('where').textContent;

describe('KeyboardShortcuts: go-to sequences', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it.each([
    ['d', '/acme/dashboard'],
    ['t', '/acme/tasks'],
    ['p', '/acme/projects'],
    ['b', '/acme/tasks?view=board'],
    ['c', '/acme/calendar'],
    ['r', '/acme/reports'],
  ])('g then %s goes to %s', (second, path) => {
    renderShortcuts();
    // Start away from the dashboard so "g d" has something to change
    act(() => { press('g'); press('t'); });
    act(() => { press('g'); press(second); });
    expect(where()).toBe(path);
  });

  it('waits one second for the second key', () => {
    renderShortcuts();
    act(() => { press('g'); });
    act(() => { jest.advanceTimersByTime(GO_SEQUENCE_MS - 100); });
    act(() => { press('t'); });
    expect(where()).toBe('/acme/tasks');
  });

  it('forgets the g after the window has passed', () => {
    renderShortcuts();
    act(() => { press('g'); });
    act(() => { jest.advanceTimersByTime(GO_SEQUENCE_MS + 1); });
    act(() => { press('t'); });
    expect(where()).toBe('/acme/dashboard');
  });

  it('cancels on any other key and does not chain', () => {
    renderShortcuts();
    act(() => { press('g'); press('x'); press('t'); });
    expect(where()).toBe('/acme/dashboard');
  });

  it('skips pages the role cannot open', () => {
    renderShortcuts(['tasks:read']);
    act(() => { press('g'); press('r'); });
    expect(where()).toBe('/acme/dashboard');
    act(() => { press('g'); press('p'); });
    expect(where()).toBe('/acme/dashboard');
    act(() => { press('g'); press('t'); });
    expect(where()).toBe('/acme/tasks');
  });

  it('claims the second key so page handlers (the calendar "t") skip it', () => {
    renderShortcuts();
    const pageHandler = jest.fn();
    document.addEventListener('keydown', pageHandler);
    act(() => { press('g'); });
    const event = new KeyboardEvent('keydown', { key: 't', bubbles: true, cancelable: true });
    act(() => { document.body.dispatchEvent(event); });
    document.removeEventListener('keydown', pageHandler);
    expect(event.defaultPrevented).toBe(true);
  });

  it('ignores the sequence while typing in a field', () => {
    renderShortcuts(ALL, <input aria-label="Name" />);
    const input = screen.getByLabelText('Name');
    act(() => { press('g', {}, input); press('t', {}, input); });
    expect(where()).toBe('/acme/dashboard');
  });
});

describe('KeyboardShortcuts: single keys', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('c opens the new task form on the tasks page', () => {
    renderShortcuts();
    act(() => { press('c'); });
    expect(where()).toBe('/acme/tasks?new=1');
  });

  it('c does nothing without tasks:write', () => {
    renderShortcuts(['tasks:read']);
    act(() => { press('c'); });
    expect(where()).toBe('/acme/dashboard');
  });

  it('ignores keys typed into inputs, textareas, selects and editable regions', () => {
    renderShortcuts(ALL, (
      <>
        <input aria-label="Field" />
        <textarea aria-label="Notes" />
        <div contentEditable suppressContentEditableWarning aria-label="Rich" role="textbox">text</div>
      </>
    ));
    for (const label of ['Field', 'Notes', 'Rich']) {
      act(() => { press('c', {}, screen.getByLabelText(label)); });
    }
    expect(where()).toBe('/acme/dashboard');
  });

  it('ignores keys while a dialog or menu is open', () => {
    renderShortcuts(ALL, <div role="dialog" aria-label="Open dialog" />);
    act(() => { press('c'); });
    expect(where()).toBe('/acme/dashboard');
  });

  it('ignores keys pressed with Ctrl, Cmd or Alt', () => {
    renderShortcuts();
    act(() => { press('c', { ctrlKey: true }); press('c', { metaKey: true }); press('c', { altKey: true }); });
    expect(where()).toBe('/acme/dashboard');
  });

  it('/ focuses the task search when the page has one', () => {
    renderShortcuts(ALL, <input type="search" aria-label="Search tasks" />);
    const search = screen.getByLabelText('Search tasks');
    act(() => { press('/'); });
    expect(search).toHaveFocus();
  });

  it('/ opens the search palette (Ctrl+K) on pages without a task search', () => {
    renderShortcuts();
    const palette = jest.fn();
    const listen = (event: KeyboardEvent) => { if (event.ctrlKey && event.key === 'k') palette(); };
    window.addEventListener('keydown', listen);
    act(() => { press('/'); });
    window.removeEventListener('keydown', listen);
    expect(palette).toHaveBeenCalledTimes(1);
  });
});

describe('KeyboardShortcuts: help dialog', () => {
  it('? opens a labelled dialog listing the shortcuts', async () => {
    renderShortcuts();
    act(() => { press('?', { shiftKey: true }); });

    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Go to dashboard')).toBeInTheDocument();
    expect(screen.getByText('Create a task')).toBeInTheDocument();
    expect(screen.getByText('Jump to today (Calendar)')).toBeInTheDocument();
    expect(screen.getByText('Send a comment')).toBeInTheDocument();
    // Key caps are real <kbd> elements
    expect(dialog.querySelectorAll('kbd').length).toBeGreaterThan(10);
  });

  it('does not open while typing', () => {
    renderShortcuts(ALL, <input aria-label="Field" />);
    act(() => { press('?', { shiftKey: true }, screen.getByLabelText('Field')); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('shortcut helpers', () => {
  it('lists every go-to key, the global keys and the existing ones', () => {
    const entries = shortcutGroups().flatMap(group => group.entries.map(entry => `${entry.label}:${entry.keys.join('+')}`));
    expect(entries).toEqual(expect.arrayContaining([
      'Go to dashboard:G+D', 'Go to board:G+B', 'Go to reports:G+R', 'Create a task:C', 'Show keyboard shortcuts:?',
    ]));
    expect(entries.some(entry => entry.startsWith('Open search from anywhere:') && entry.endsWith('+K'))).toBe(true);
    expect(entries.some(entry => entry.startsWith('Jump to today'))).toBe(true);
    expect(entries.some(entry => entry.startsWith('Resize a bar'))).toBe(true);
  });

  it('recognises text entry targets and open overlays', () => {
    const input = document.createElement('input');
    const button = document.createElement('button');
    expect(isTextEntryTarget(input)).toBe(true);
    expect(isTextEntryTarget(button)).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);

    expect(isOverlayOpen()).toBe(false);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);
    expect(isOverlayOpen()).toBe(true);
    dialog.remove();
  });
});
