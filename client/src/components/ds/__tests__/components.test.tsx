import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Accordion, ActivityItem, AvatarStack, Breadcrumbs, Disclosure, Divider, ErrorState, Kbd, ProgressRing,
  SearchInput, SegmentedControl, StatusPill, Timeline, TooltipHint, TypeBadge,
} from '..';

describe('Kbd', () => {
  it('renders a kbd element', () => {
    render(<Kbd>Ctrl</Kbd>);
    expect(screen.getByText('Ctrl').tagName).toBe('KBD');
  });
});

describe('SearchInput', () => {
  const Harness = ({ onClear }: { onClear?: () => void }) => {
    const [value, setValue] = useState('');
    return <SearchInput label="Search tasks" value={value} onValueChange={setValue} onClear={onClear} />;
  };

  it('is a labelled search field and shows the clear button only with text', async () => {
    render(<Harness />);
    const input = screen.getByRole('searchbox', { name: 'Search tasks' });
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();

    await userEvent.type(input, 'report');
    expect(input).toHaveValue('report');
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
  });

  it('clears with Escape', async () => {
    const onClear = jest.fn();
    render(<Harness onClear={onClear} />);
    const input = screen.getByRole('searchbox');
    await userEvent.type(input, 'abc{Escape}');
    expect(input).toHaveValue('');
    expect(onClear).toHaveBeenCalled();
  });
});

describe('SegmentedControl', () => {
  const options = [
    { value: 'list', label: 'List' },
    { value: 'board', label: 'Board' },
    { value: 'calendar', label: 'Calendar', disabled: true },
    { value: 'timeline', label: 'Timeline' },
  ];
  const Harness = () => {
    const [value, setValue] = useState('list');
    return <SegmentedControl aria-label="View" options={options} value={value} onValueChange={setValue} />;
  };

  it('exposes a radiogroup with one tab stop', () => {
    render(<Harness />);
    expect(screen.getByRole('radiogroup', { name: 'View' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'List' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'List' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Board' })).toHaveAttribute('tabindex', '-1');
  });

  it('moves and selects with arrow keys, skipping disabled options and wrapping', async () => {
    render(<Harness />);
    screen.getByRole('radio', { name: 'List' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Board' })).toBeChecked();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Timeline' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Timeline' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'List' })).toBeChecked();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('radio', { name: 'Timeline' })).toBeChecked();
    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('radio', { name: 'List' })).toBeChecked();
  });

  it('selects on click', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('radio', { name: 'Timeline' }));
    expect(screen.getByRole('radio', { name: 'Timeline' })).toBeChecked();
  });
});

describe('Breadcrumbs', () => {
  it('is a labelled nav and marks the current page', () => {
    render(<Breadcrumbs items={[{ label: 'Projects', href: '/p' }, { label: 'Website', href: '/p/w' }, { label: 'Sprint 4' }]} />);
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/p');
    expect(screen.getByText('Sprint 4')).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Sprint 4' })).not.toBeInTheDocument();
  });

  it('supports custom links', () => {
    render(
      <Breadcrumbs
        items={[{ label: 'Home', href: '/' }, { label: 'Now' }]}
        renderLink={(item, className) => <button className={className}>{item.label}</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
  });
});

describe('Disclosure and Accordion', () => {
  it('toggles aria-expanded and the panel', async () => {
    render(<Disclosure title="Details">Hidden text</Disclosure>);
    const button = screen.getByRole('button', { name: 'Details' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Hidden text')).not.toBeVisible();

    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Hidden text')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Details' })).toHaveAttribute('id', button.getAttribute('aria-controls'));
  });

  it('single type closes the other item; multiple keeps both', async () => {
    const items = [
      { id: 'a', title: 'First', content: 'one' },
      { id: 'b', title: 'Second', content: 'two' },
    ];
    const { rerender } = render(<Accordion items={items} defaultOpenIds={['a']} />);
    await userEvent.click(screen.getByRole('button', { name: 'Second' }));
    expect(screen.getByRole('button', { name: 'First' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Second' })).toHaveAttribute('aria-expanded', 'true');

    rerender(<Accordion key="multi" items={items} type="multiple" defaultOpenIds={['a']} />);
    await userEvent.click(screen.getByRole('button', { name: 'Second' }));
    expect(screen.getByRole('button', { name: 'First' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Second' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('works controlled and with the keyboard', async () => {
    const onOpenChange = jest.fn();
    render(<Disclosure title="Controlled" open={false} onOpenChange={onOpenChange}>Body</Disclosure>);
    screen.getByRole('button', { name: 'Controlled' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole('button', { name: 'Controlled' })).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('ProgressRing', () => {
  it('exposes a clamped progressbar value and a name', () => {
    render(<ProgressRing value={140} label="Sprint 4 progress" />);
    const ring = screen.getByRole('progressbar', { name: 'Sprint 4 progress' });
    expect(ring).toHaveAttribute('aria-valuenow', '100');
    expect(ring).toHaveTextContent('100%');
  });

  it('can hide the number', () => {
    render(<ProgressRing value={42} label="Docs" showValue={false} />);
    expect(screen.getByRole('progressbar', { name: 'Docs' })).toHaveAttribute('aria-valuenow', '42');
    expect(screen.queryByText('42%')).not.toBeInTheDocument();
  });
});

describe('StatusPill and TypeBadge', () => {
  it('shows a readable status label (not color only)', () => {
    render(
      <>
        <StatusPill status="in-progress" />
        <StatusPill status="completed">Done</StatusPill>
      </>,
    );
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('shows the type name', () => {
    render(<TypeBadge type="bug" />);
    expect(screen.getByText('Bug')).toBeInTheDocument();
  });
});

describe('AvatarStack', () => {
  const people = ['Ada Lovelace', 'Grace Hopper', 'Linus Torvalds', 'Alan Turing', 'Edsger Dijkstra', 'Barbara Liskov'].map(name => ({ name }));

  it('names everyone in the group and shows an overflow counter', () => {
    render(<AvatarStack people={people} max={3} />);
    expect(screen.getByRole('group', { name: /Ada Lovelace, Grace Hopper, Linus Torvalds, Alan Turing/ })).toBeInTheDocument();
    expect(screen.getByText('+3')).toBeInTheDocument();
    expect(screen.getByText('AL')).toBeInTheDocument();
    expect(screen.queryByText('AT')).not.toBeInTheDocument();
  });

  it('handles an empty list', () => {
    render(<AvatarStack people={[]} />);
    expect(screen.getByRole('group', { name: 'No one assigned' })).toBeInTheDocument();
  });
});

describe('Divider', () => {
  it('renders a separator, or a label between rules', () => {
    const { rerender } = render(<Divider />);
    expect(screen.getByRole('separator')).toBeInTheDocument();
    rerender(<Divider label="or" />);
    expect(screen.getByText('or')).toBeInTheDocument();
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });
});

describe('ErrorState', () => {
  it('announces what happened, why and what to do', () => {
    render(
      <ErrorState
        title="Couldn't load your tasks"
        reason="The server didn't respond."
        nextStep="Check your connection and try again."
        action={<button>Try again</button>}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load your tasks");
    expect(alert).toHaveTextContent("The server didn't respond.");
    expect(alert).toHaveTextContent('Check your connection and try again.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('Timeline and ActivityItem', () => {
  it('renders a list of entries with machine-readable times', () => {
    render(
      <Timeline aria-label="Activity">
        <ActivityItem actor="Ada Lovelace" timestamp="2026-10-09T10:00:00Z" timeLabel="2 hours ago">moved this to Done</ActivityItem>
        <ActivityItem actor="Grace Hopper">added a comment</ActivityItem>
      </Timeline>,
    );
    expect(screen.getByRole('list', { name: 'Activity' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('2 hours ago')).toHaveAttribute('datetime', '2026-10-09T10:00:00Z');
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });
});

describe('TooltipHint', () => {
  it('keeps the trigger focusable and shows the hint on focus', async () => {
    render(
      <TooltipHint label="Copy link">
        <button type="button" aria-label="Copy link">C</button>
      </TooltipHint>,
    );
    const trigger = screen.getByRole('button', { name: 'Copy link' });
    await userEvent.tab();
    expect(trigger).toHaveFocus();
    expect(await screen.findByText('Copy link')).toBeInTheDocument();
  });
});
