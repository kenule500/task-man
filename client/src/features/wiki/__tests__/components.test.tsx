import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ConflictDialog from '../components/ConflictDialog';
import PageEditor from '../components/PageEditor';
import WikiTree from '../components/WikiTree';
import type { WikiPage, WikiPageSummary } from '../types';

jest.mock('@/features/tasks/hooks/useTasks', () => ({ useTasks: () => ({ tasks: [], loading: false }) }));

const summary = (_id: string, parent: string | null, position: number, title: string): WikiPageSummary => ({
  _id, parent, position, title, project: '', slug: _id, version: 1, archived: false,
  createdBy: null, updatedBy: null, createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z',
});

const pages = [summary('a', null, 0, 'Handbook'), summary('b', 'a', 0, 'Onboarding'), summary('c', null, 1, 'Decisions')];

const Tree = ({ onSelect }: { onSelect: (id: string) => void }) => {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  return (
    <WikiTree
      pages={pages}
      selectedId="c"
      expanded={expanded}
      onToggle={id => setExpanded(previous => {
        const next = new Set(previous);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      })}
      onSelect={onSelect}
    />
  );
};

describe('WikiTree', () => {
  it('is an ARIA tree with levels, selection and one tab stop', () => {
    render(<Tree onSelect={() => undefined} />);
    expect(screen.getByRole('tree', { name: 'Wiki pages' })).toBeInTheDocument();
    const items = screen.getAllByRole('treeitem');
    expect(items.map(item => item.textContent)).toEqual(['Handbook', 'Decisions']);
    expect(items[0]).toHaveAttribute('aria-expanded', 'false');
    expect(items[0]).toHaveAttribute('aria-level', '1');
    expect(items[1]).toHaveAttribute('aria-selected', 'true');
    expect(items.filter(item => item.tabIndex === 0)).toHaveLength(1);
  });

  it('moves with the arrow keys, opens and closes branches, and selects with Enter', async () => {
    const onSelect = jest.fn();
    const user = userEvent.setup();
    render(<Tree onSelect={onSelect} />);

    screen.getAllByRole('treeitem')[0].focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getAllByRole('treeitem')).toHaveLength(3);
    expect(screen.getAllByRole('treeitem')[0]).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('treeitem', { name: 'Onboarding' })).toHaveFocus();
    expect(screen.getByRole('treeitem', { name: 'Onboarding' })).toHaveAttribute('aria-level', '2');

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('treeitem', { name: 'Handbook' })).toHaveFocus();

    await user.keyboard('{End}');
    expect(screen.getByRole('treeitem', { name: 'Decisions' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('c');

    await user.keyboard('{Home}{ArrowLeft}');
    expect(screen.getAllByRole('treeitem')).toHaveLength(2);
  });
});

describe('ConflictDialog', () => {
  const theirs = {
    ...summary('p', null, 0, 'Their title'),
    content: 'Their text',
    mentions: [],
    version: 4,
    updatedBy: { _id: 'u2', name: 'Bob' },
    updatedAt: new Date().toISOString(),
  } as WikiPage;

  it('shows both versions and offers keep mine, take theirs and keep editing', async () => {
    const handlers = { onKeepMine: jest.fn(), onTakeTheirs: jest.fn(), onClose: jest.fn() };
    const user = userEvent.setup();
    render(<ConflictDialog theirs={theirs} mine={{ title: 'My title', content: 'My text' }} busy={false} {...handlers} />);

    expect(screen.getByRole('dialog')).toHaveTextContent('Bob saved a newer version');
    expect(screen.getByRole('region', { name: 'Their version' })).toHaveTextContent('Their text');
    expect(screen.getByRole('region', { name: 'Your version' })).toHaveTextContent('My text');

    await user.click(screen.getByRole('button', { name: 'Keep mine' }));
    await user.click(screen.getByRole('button', { name: 'Take theirs' }));
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(handlers.onKeepMine).toHaveBeenCalledTimes(1);
    expect(handlers.onTakeTheirs).toHaveBeenCalledTimes(1);
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing without a conflicting page', () => {
    render(<ConflictDialog theirs={null} mine={{ title: '', content: '' }} busy={false} onKeepMine={jest.fn()} onTakeTheirs={jest.fn()} onClose={jest.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('PageEditor', () => {
  const Editor = ({ onSave }: { onSave: () => void }) => {
    const [title, setTitle] = useState('Guide');
    const [content, setContent] = useState('hello');
    return (
      <MemoryRouter>
        <PageEditor
          workspaceSlug="demo"
          title={title}
          content={content}
          mentions={[]}
          onTitleChange={setTitle}
          onContentChange={setContent}
          onSave={onSave}
          onCancel={() => undefined}
          saving={false}
          dirty
        />
      </MemoryRouter>
    );
  };

  it('formats the selection from the toolbar and previews it', async () => {
    const user = userEvent.setup();
    render(<Editor onSave={() => undefined} />);
    const field = screen.getByRole('textbox', { name: 'Page content (Markdown)' }) as HTMLTextAreaElement;
    field.focus();
    field.setSelectionRange(0, 5);
    await user.click(screen.getByRole('button', { name: 'Bold' }));
    expect(field.value).toBe('**hello**');
    expect(screen.getByRole('region', { name: 'Preview' }).querySelector('strong')).toHaveTextContent('hello');
  });

  it('saves with Ctrl+S from the text area', async () => {
    const onSave = jest.fn();
    const user = userEvent.setup();
    render(<Editor onSave={onSave} />);
    screen.getByRole('textbox', { name: 'Page content (Markdown)' }).focus();
    await user.keyboard('{Control>}s{/Control}');
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('disables Save without a title', async () => {
    const user = userEvent.setup();
    render(<Editor onSave={() => undefined} />);
    await user.clear(screen.getByRole('textbox', { name: /Title/ }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
