import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FormDialog from '../FormDialog';

jest.setTimeout(30000);

const renderDialog = (overrides: Partial<React.ComponentProps<typeof FormDialog>> = {}) =>
  render(
    <FormDialog
      open
      onOpenChange={jest.fn()}
      icon={<span />}
      title="Edit role"
      description="Update this role."
      onSubmit={(event) => event.preventDefault()}
      submitLabel="Save changes"
      submittingLabel="Saving..."
      {...overrides}
    >
      <p>Field content</p>
    </FormDialog>,
  );

describe('FormDialog', () => {
  it('keeps the body scrollable on every breakpoint (it must be allowed to shrink)', () => {
    renderDialog();
    const body = screen.getByText('Field content').parentElement!;
    expect(body).toHaveAttribute('data-slot', 'form-dialog-body');
    expect(body).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto', 'sm:flex-initial');
    // The old desktop bug: a non-shrinking body inside an overflow-hidden dialog
    expect(body).not.toHaveClass('sm:flex-none');
  });

  it('renders the footer actions outside the scrolling body', () => {
    renderDialog();
    const body = screen.getByText('Field content').parentElement!;
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(body).not.toContainElement(save);
  });

  it('shows the error above the fields and calls onOpenChange on cancel', async () => {
    const onOpenChange = jest.fn();
    renderDialog({ error: 'Could not save', onOpenChange });
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
