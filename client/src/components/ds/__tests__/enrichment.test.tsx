import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Banner, DescriptionItem, DescriptionList, OptionCombobox, Pagination, SkeletonBoard, SkeletonChart, SkeletonDetail,
  SkeletonList, SkeletonTable, Stepper, SwitchField, TagInput, getPageItems, getPageRange,
  type ComboboxOption,
} from '..';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';

describe('Switch', () => {
  it('is a labelled switch that toggles with a click and with Space', async () => {
    const onCheckedChange = jest.fn();
    render(<Switch aria-label="Email alerts" onCheckedChange={onCheckedChange} />);
    const control = screen.getByRole('switch', { name: 'Email alerts' });
    expect(control).toHaveAttribute('aria-checked', 'false');

    await userEvent.click(control);
    expect(control).toHaveAttribute('aria-checked', 'true');

    control.focus();
    await userEvent.keyboard(' ');
    expect(control).toHaveAttribute('aria-checked', 'false');
    expect(onCheckedChange).toHaveBeenCalledTimes(2);
    expect(onCheckedChange.mock.calls[0][0]).toBe(true);
  });

  it('does nothing when disabled and supports two sizes', async () => {
    const onCheckedChange = jest.fn();
    render(
      <>
        <Switch aria-label="Off" disabled onCheckedChange={onCheckedChange} />
        <Switch aria-label="Small" size="sm" />
        <Switch aria-label="Medium" size="md" />
      </>,
    );
    await userEvent.click(screen.getByRole('switch', { name: 'Off' }));
    expect(onCheckedChange).not.toHaveBeenCalled();
    expect(screen.getByRole('switch', { name: 'Small' }).className).toContain('h-5');
    expect(screen.getByRole('switch', { name: 'Medium' }).className).toContain('h-6');
  });

  it('SwitchField names and describes the switch, and the label toggles it', async () => {
    const Harness = () => {
      const [checked, setChecked] = useState(false);
      return <SwitchField label="Weekly digest" description="One email every Monday." checked={checked} onCheckedChange={setChecked} />;
    };
    render(<Harness />);
    const control = screen.getByRole('switch', { name: 'Weekly digest' });
    expect(control).toHaveAccessibleDescription('One email every Monday.');

    await userEvent.click(screen.getByText('Weekly digest'));
    expect(control).toHaveAttribute('aria-checked', 'true');
  });
});

describe('Skeleton variants', () => {
  it.each([
    ['SkeletonList', <SkeletonList key="a" label="Loading tasks" rows={3} />, 'Loading tasks'],
    ['SkeletonBoard', <SkeletonBoard key="b" label="Loading board" />, 'Loading board'],
    ['SkeletonTable', <SkeletonTable key="c" label="Loading audit log" />, 'Loading audit log'],
    ['SkeletonChart', <SkeletonChart key="d" label="Loading report" />, 'Loading report'],
    ['SkeletonDetail', <SkeletonDetail key="e" label="Loading task" />, 'Loading task'],
  ])('%s is a busy status region with hidden text', (_name, node, label) => {
    render(node);
    const region = screen.getByRole('status', { name: label });
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(within(region).getByText(label)).toHaveClass('sr-only');
  });

  it('SkeletonList renders the requested rows', () => {
    const { container } = render(<SkeletonList rows={4} />);
    expect(container.querySelectorAll('li')).toHaveLength(4);
  });
});

describe('Pagination', () => {
  it('computes page items with ellipsis and a stable length', () => {
    expect(getPageItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(getPageItems(1, 10)).toEqual([1, 2, 3, 4, 5, 'ellipsis-end', 10]);
    expect(getPageItems(5, 10)).toEqual([1, 'ellipsis-start', 4, 5, 6, 'ellipsis-end', 10]);
    expect(getPageItems(10, 10)).toEqual([1, 'ellipsis-start', 6, 7, 8, 9, 10]);
    expect(getPageRange(3, 10, 24)).toEqual({ start: 21, end: 24 });
    expect(getPageRange(1, 10, 0)).toEqual({ start: 0, end: 0 });
  });

  it('shows the range, marks the current page and changes page', async () => {
    const onPageChange = jest.fn();
    render(<Pagination page={5} total={100} pageSize={10} onPageChange={onPageChange} label="Results" />);
    expect(screen.getByRole('navigation', { name: 'Results' })).toBeInTheDocument();
    expect(screen.getByText(/41–50/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 5' })).toHaveAttribute('aria-current', 'page');

    await userEvent.click(screen.getByRole('button', { name: 'Page 6' }));
    expect(onPageChange).toHaveBeenLastCalledWith(6);
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPageChange).toHaveBeenLastCalledWith(4);
  });

  it('disables Previous on the first page and Next on the last', () => {
    const { rerender } = render(<Pagination page={1} total={25} pageSize={10} onPageChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    rerender(<Pagination page={3} total={25} pageSize={10} onPageChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('changes the page size', async () => {
    const onPageSizeChange = jest.fn();
    render(<Pagination page={1} total={100} pageSize={10} pageSizeOptions={[10, 25, 50]} onPageSizeChange={onPageSizeChange} onPageChange={jest.fn()} />);
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: '25' }));
    expect(onPageSizeChange).toHaveBeenCalledWith(25);
  });

  it('compact cursor mode shows a custom summary and only previous/next', async () => {
    const onNext = jest.fn();
    render(
      <Pagination compact summary="Showing entries 1–20" previousLabel="Newer" nextLabel="Older" hasPrevious={false} hasNext onPrevious={jest.fn()} onNext={onNext} />,
    );
    expect(screen.getByText('Showing entries 1–20')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Page/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Newer' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Older' }));
    expect(onNext).toHaveBeenCalled();
  });
});

describe('Stepper', () => {
  const steps = [
    { id: 'a', title: 'Workspace' },
    { id: 'b', title: 'Project', description: 'Name it' },
    { id: 'c', title: 'Invite' },
  ];

  it('is an ordered list that marks the current step and states every status in text', () => {
    render(<Stepper steps={steps} current={1} label="Setup progress" />);
    const list = screen.getByRole('list', { name: 'Setup progress' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[0]).not.toHaveAttribute('aria-current');
    expect(items[0]).toHaveTextContent('Workspace, completed');
    expect(items[1]).toHaveTextContent('Project, current step');
    expect(items[2]).toHaveTextContent('Invite, not started');
  });

  it('supports a vertical layout and out-of-order completion', () => {
    render(<Stepper steps={[{ ...steps[0] }, { ...steps[1] }, { ...steps[2], complete: true }]} current={0} orientation="vertical" label="Checklist" />);
    expect(screen.getByRole('list', { name: 'Checklist' }).className).toContain('flex-col');
    expect(screen.getByText(/Invite/).closest('li')).toHaveTextContent('Invite, completed');
  });
});

describe('Banner', () => {
  it('announces danger at once and the other tones politely', () => {
    const { rerender } = render(<Banner tone="danger">Connection lost.</Banner>);
    expect(screen.getByRole('alert')).toHaveTextContent('Connection lost.');
    rerender(<Banner tone="warning">You are offline.</Banner>);
    expect(screen.getByRole('status')).toHaveTextContent('You are offline.');
  });

  it('renders an action and a dismiss button', async () => {
    const onDismiss = jest.fn();
    render(<Banner tone="info" title="Update ready" action={<button type="button">Reload</button>} onDismiss={onDismiss}>A new version is available.</Banner>);
    expect(screen.getByText('Update ready')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalled();
  });
});

describe('DescriptionList', () => {
  it('renders terms and descriptions in a dl', () => {
    const { container } = render(
      <DescriptionList columns={2}>
        <DescriptionItem label="Due date">12 Oct</DescriptionItem>
        <DescriptionItem label="Sprint" wide>Sprint 4</DescriptionItem>
      </DescriptionList>,
    );
    expect(container.querySelector('dl')).not.toBeNull();
    expect(container.querySelectorAll('dt')).toHaveLength(2);
    expect(screen.getByText('Due date').tagName).toBe('DT');
    expect(screen.getByText('12 Oct').tagName).toBe('DD');
  });
});

describe('TagInput', () => {
  const Harness = ({ initial = [] as string[], max }: { initial?: string[]; max?: number }) => {
    const [tags, setTags] = useState(initial);
    return <TagInput value={tags} onChange={setTags} suggestions={['api', 'ui', 'bug']} noun="label" max={max} />;
  };

  it('adds with Enter and comma, ignores duplicates, removes with Backspace and the remove button', async () => {
    render(<Harness />);
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'frontend{Enter}');
    await userEvent.type(input, 'Frontend{Enter}');
    await userEvent.type(input, 'api,');
    expect(screen.getByText('frontend')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Remove label/ })).toHaveLength(2);

    await userEvent.keyboard('{Backspace}');
    expect(screen.queryByRole('button', { name: 'Remove label api' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove label frontend' }));
    expect(screen.queryByRole('button', { name: 'Remove label frontend' })).not.toBeInTheDocument();
  });

  it('offers suggestions and stops at the maximum', async () => {
    render(<Harness initial={['ui']} max={2} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add label api' }));
    expect(screen.getByText('Maximum of 2 labels reached.')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeDisabled();
  });
});

describe('Popover', () => {
  it('opens from its trigger and closes with Escape', async () => {
    render(
      <Popover>
        <PopoverTrigger>Filters</PopoverTrigger>
        <PopoverContent aria-label="Filter options">Pick a status</PopoverContent>
      </Popover>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
    expect(await screen.findByText('Pick a status')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText('Pick a status')).not.toBeInTheDocument());
  });
});

describe('HoverCard', () => {
  it('opens on keyboard focus after the delay', async () => {
    render(
      <HoverCard>
        <HoverCardTrigger render={<button type="button" />}>Ada Lovelace</HoverCardTrigger>
        <HoverCardContent>ada@example.com</HoverCardContent>
      </HoverCard>,
    );
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Ada Lovelace' })).toHaveFocus();
    expect(await screen.findByText('ada@example.com', undefined, { timeout: 2000 })).toBeInTheDocument();
  });
});

describe('OptionCombobox', () => {
  const options: ComboboxOption[] = [
    { value: 'u1', label: 'Ada Lovelace', description: 'ada@example.com' },
    { value: 'u2', label: 'Grace Hopper' },
    { value: 'u3', label: 'Alan Turing' },
  ];

  it('single: filters while typing and selects an option', async () => {
    const Harness = () => {
      const [value, setValue] = useState<string | null>(null);
      return <OptionCombobox label="Owner" options={options} value={value} onValueChange={setValue} />;
    };
    render(<Harness />);
    const input = screen.getByRole('combobox', { name: 'Owner' });
    await userEvent.click(input);
    await userEvent.type(input, 'gra');
    expect(await screen.findByRole('option', { name: /Grace Hopper/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Ada/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('option', { name: /Grace Hopper/ }));
    await waitFor(() => expect(input).toHaveValue('Grace Hopper'));
  });

  it('single: shows the empty text when nothing matches', async () => {
    render(<OptionCombobox label="Owner" options={options} value={null} onValueChange={jest.fn()} emptyText="Nobody found." />);
    const input = screen.getByRole('combobox', { name: 'Owner' });
    await userEvent.click(input);
    await userEvent.type(input, 'zzz');
    expect(await screen.findByText('Nobody found.')).toBeInTheDocument();
  });

  it('multiple: adds and removes chips', async () => {
    const onValueChange = jest.fn();
    const Harness = () => {
      const [value, setValue] = useState<string[]>(['u1']);
      return <OptionCombobox multiple label="Assignees" options={options} value={value} onValueChange={next => { onValueChange(next); setValue(next); }} />;
    };
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Remove Ada Lovelace' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox', { name: 'Assignees' }));
    await userEvent.click(await screen.findByRole('option', { name: /Alan Turing/ }));
    expect(onValueChange).toHaveBeenLastCalledWith(['u1', 'u3']);
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByRole('button', { name: 'Remove Alan Turing' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove Ada Lovelace' }));
    expect(onValueChange).toHaveBeenLastCalledWith(['u3']);
  });
});
