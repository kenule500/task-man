import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MarkdownView from '../components/MarkdownView';

const renderMarkdown = (source: string, mentions = [] as { key: string; id: string; title: string; status: string }[]) =>
  render(
    <MemoryRouter>
      <MarkdownView source={source} workspaceSlug="demo" mentions={mentions} />
    </MemoryRouter>,
  );

describe('MarkdownView', () => {
  it('renders GitHub-flavoured Markdown', () => {
    renderMarkdown('# Title\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n- [ ] todo\n\n~~old~~');
    // Content headings sit under the page title (h2), so "# Title" is an h3
    expect(screen.getByRole('heading', { level: 3, name: 'Title' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toBeChecked();
    expect(boxes[0]).toBeDisabled();
  });

  it('never renders raw HTML or script', () => {
    const { container } = renderMarkdown('<script>window.hacked = true</script>\n\n<img src=x onerror="window.hacked = true">\n\n<b>bold</b>');
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect((window as unknown as { hacked?: boolean }).hacked).toBeUndefined();
  });

  it('opens external links safely in a new tab', () => {
    renderMarkdown('[docs](https://example.com/docs)');
    const link = screen.getByRole('link', { name: /docs/ });
    expect(link).toHaveAttribute('href', 'https://example.com/docs');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('drops javascript: addresses', () => {
    renderMarkdown('[click](javascript:alert(1))');
    const link = screen.queryByRole('link', { name: 'click' });
    expect(link?.getAttribute('href') ?? '').not.toMatch(/^javascript:/i);
  });

  it('links known task keys to the task and leaves unknown ones as text', () => {
    renderMarkdown('Blocked by WEB-12 and API-9.', [{ key: 'WEB-12', id: 't1', title: 'Fix login', status: 'pending' }]);
    const link = screen.getByRole('link', { name: 'WEB-12' });
    expect(link).toHaveAttribute('href', '/demo/tasks?task=t1');
    expect(link).toHaveAttribute('title', 'Fix login');
    expect(screen.queryByRole('link', { name: 'API-9' })).toBeNull();
    expect(screen.getByText(/API-9/)).toBeInTheDocument();
  });

  it('shows images as links so remote servers learn nothing', () => {
    const { container } = renderMarkdown('![diagram](https://example.com/a.png)');
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('link', { name: /diagram/ })).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
