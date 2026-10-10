import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectFormDialog from '../components/ProjectFormDialog';
import { makeProject } from './fixtures';

// Dialogs and portals are slow on constrained machines.
jest.setTimeout(30000);

const renderDialog = (project = makeProject({ name: 'Website', color: 'violet', icon: 'rocket' })) =>
  render(<ProjectFormDialog open onOpenChange={jest.fn()} project={project} onSubmit={jest.fn().mockResolvedValue(undefined)} />);

const previewFill = () => within(screen.getByTestId('project-preview')).getByTestId('project-folder-icon').querySelector('rect');

describe('ProjectFormDialog appearance', () => {
  it('previews the project color and icon as a large folder', () => {
    renderDialog();
    const folder = within(screen.getByTestId('project-preview')).getByTestId('project-folder-icon');
    expect(folder).toHaveClass('size-14');
    expect(previewFill()).toHaveClass('text-project-violet');
  });

  it('updates the preview and the icon options when the color changes', async () => {
    renderDialog();
    await userEvent.click(screen.getByRole('radio', { name: 'Lagoon' }));
    expect(previewFill()).toHaveClass('text-project-teal');
    const iconGroup = screen.getByRole('group', { name: 'Icon' });
    const options = within(iconGroup).getAllByTestId('project-folder-icon');
    expect(options).toHaveLength(8);
    for (const option of options) expect(option.querySelector('rect')).toHaveClass('text-project-teal');
  });

  it('updates the preview glyph when another icon is picked', async () => {
    renderDialog();
    const glyph = () => within(screen.getByTestId('project-preview')).getByTestId('project-folder-icon').querySelector('svg.text-white')?.innerHTML;
    const before = glyph();
    await userEvent.click(screen.getByRole('radio', { name: 'Bug' }));
    expect(glyph()).not.toBe(before);
    expect(screen.getByRole('radio', { name: 'Bug' })).toBeChecked();
  });
});
