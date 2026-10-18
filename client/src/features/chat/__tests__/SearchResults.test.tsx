import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchResults from '../components/SearchResults';
import type { ChatMessage } from '../types';

beforeAll(() => {
  // jsdom has no layout, so scrollIntoView has to be stubbed for the "keep selection in view" effect
  Element.prototype.scrollIntoView = jest.fn();
});

const message = (id: string, body: string, author = 'Ada'): ChatMessage => ({
  _id: id,
  channel: 'channel-1',
  author: { _id: `user-${id}`, name: author },
  body,
  mentions: [],
  attachments: [],
  replyCount: 0,
  createdAt: '2026-10-02T10:00:00.000Z',
});

const renderResults = (overrides: Partial<React.ComponentProps<typeof SearchResults>> = {}) => {
  const props = {
    results: [message('m1', 'deploy the app'), message('m2', 'redeploy again')],
    term: 'deploy',
    activeIndex: 0,
    loading: false,
    loadingMore: false,
    notice: '',
    onSelect: jest.fn(),
    onOpen: jest.fn(),
    ...overrides,
  };
  render(<SearchResults {...props} />);
  return props;
};

describe('SearchResults', () => {
  it('AC-071: renders a labelled listbox with author, date and highlighted snippet', () => {
    renderResults();

    const list = screen.getByRole('listbox', { name: 'Search results' });
    const options = within(list).getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('Ada');
    expect(options[0]).toHaveTextContent(/\d{1,2}:\d{2}/);
    // Every occurrence of the term is marked, not only the first
    expect(within(options[0]).getByText('deploy').tagName).toBe('MARK');
    expect(within(options[1]).getByText('deploy').tagName).toBe('MARK');
  });

  it('AC-071: selects exactly one row', () => {
    renderResults({ activeIndex: 1 });
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('AC-071: opens the row on click and reports the index', async () => {
    const props = renderResults();
    await userEvent.click(screen.getAllByRole('option')[1]);

    expect(props.onSelect).toHaveBeenCalledWith(1);
    expect(props.onOpen).toHaveBeenCalledWith(expect.objectContaining({ _id: 'm2' }));
  });

  it('EC-027: says so when nothing matched', () => {
    renderResults({ results: [], term: 'xylophone' });
    expect(screen.getByText(/No messages matched/)).toHaveTextContent('xylophone');
  });

  it('AC-070: explains what to do before anything is typed', () => {
    renderResults({ results: [], term: '   ' });
    expect(screen.getByText('Type to search this channel.')).toBeInTheDocument();
  });

  it('AC-074: surfaces a message that could not be opened', () => {
    renderResults({ notice: 'That message is no longer available.' });
    expect(screen.getByRole('alert')).toHaveTextContent('no longer available');
  });
});
