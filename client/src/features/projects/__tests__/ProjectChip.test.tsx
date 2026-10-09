import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProjectChip from '../components/ProjectChip';
import { ProjectsContext, type ProjectDirectory } from '../context/ProjectsContext';
import { makeProject } from './fixtures';

const website = makeProject({ _id: 'p-web', name: 'Website', key: 'WEB', color: 'violet', icon: 'rocket' });

const directory = (): ProjectDirectory => ({
  slug: 'acme',
  projects: [website],
  loading: false,
  byName: name => (name?.trim().toLowerCase() === 'website' ? website : undefined),
  reload: async () => undefined,
});

const renderChip = (ui: ReactElement) =>
  render(
    <ProjectsContext.Provider value={directory()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </ProjectsContext.Provider>,
  );

describe('ProjectChip', () => {
  it('links a known project to its page with its folder icon', () => {
    renderChip(<ProjectChip name="website" />);
    const link = screen.getByRole('link', { name: 'Website' });
    expect(link).toHaveAttribute('href', '/acme/projects/p-web');
    expect(link.querySelector('rect')).toHaveClass('text-violet-600');
  });

  it('shows the key in mono when asked', () => {
    renderChip(<ProjectChip name="Website" showKey />);
    expect(screen.getByText('WEB')).toHaveClass('font-mono');
  });

  it('hides the key by default', () => {
    renderChip(<ProjectChip name="Website" />);
    expect(screen.queryByText('WEB')).not.toBeInTheDocument();
  });

  it('is plain text with a neutral folder for an unknown project', () => {
    const { container } = renderChip(<ProjectChip name="Legacy" showKey />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Legacy')).toBeInTheDocument();
    expect(container.querySelector('rect')).toHaveClass('text-slate-600');
  });

  it('can render without a link inside another link', () => {
    renderChip(<ProjectChip name="Website" link={false} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Website')).toBeInTheDocument();
  });

  it('works without a provider or router', () => {
    render(<ProjectChip name="Website" />);
    expect(screen.getByText('Website')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('uses the project prop over the directory', () => {
    const own = makeProject({ _id: 'p-own', name: 'Own', color: 'rose' });
    renderChip(<ProjectChip name="anything" project={own} />);
    expect(screen.getByRole('link', { name: 'Own' })).toHaveAttribute('href', '/acme/projects/p-own');
  });
});
