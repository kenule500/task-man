import { render, screen } from '@testing-library/react';
import ProjectFolderIcon from '../components/ProjectFolderIcon';
import { PROJECT_COLOR_STYLES } from '../lib/appearance';
import { PROJECT_COLORS } from '../types';

const folder = () => screen.getByTestId('project-folder-icon');

describe('ProjectFolderIcon', () => {
  it('is decorative by default', () => {
    render(<ProjectFolderIcon color="blue" icon="rocket" />);
    expect(folder()).toHaveAttribute('aria-hidden', 'true');
    expect(folder()).not.toHaveAttribute('role');
  });

  it('exposes an image role with a label when asked', () => {
    render(<ProjectFolderIcon color="blue" icon="rocket" label="Website project" />);
    expect(screen.getByRole('img', { name: 'Website project' })).toBeInTheDocument();
    expect(folder()).not.toHaveAttribute('aria-hidden');
  });

  it.each([
    ['xs', 'size-4'], ['sm', 'size-5'], ['md', 'size-7'], ['lg', 'size-10'], ['xl', 'size-14'],
  ] as const)('sizes %s as %s', (size, cls) => {
    render(<ProjectFolderIcon size={size} />);
    expect(folder()).toHaveClass(cls);
  });

  it('defaults to the sm size', () => {
    render(<ProjectFolderIcon />);
    expect(folder()).toHaveClass('size-5');
  });

  it.each(PROJECT_COLORS)('fills the %s folder with its palette tones', color => {
    const { container } = render(<ProjectFolderIcon color={color} />);
    expect(container.querySelector('path')).toHaveClass(PROJECT_COLOR_STYLES[color].fillBack);
    expect(container.querySelector('rect')).toHaveClass(PROJECT_COLOR_STYLES[color].fill);
  });

  it('uses the same tones as the folder card so white glyphs keep their contrast', () => {
    for (const color of PROJECT_COLORS) {
      const style = PROJECT_COLOR_STYLES[color];
      expect(style.fill).toBe(style.body.replace('bg-', 'text-'));
      expect(style.fillBack).toBe(style.back.replace('bg-', 'text-'));
    }
  });

  it('falls back to a blue folder for unknown colors', () => {
    const { container } = render(<ProjectFolderIcon color="nope" icon="nope" />);
    expect(container.querySelector('rect')).toHaveClass('text-project-blue');
    expect(container.querySelector('svg.text-white')).toBeInTheDocument();
  });

  it('draws a different white glyph per icon', () => {
    const { container: a } = render(<ProjectFolderIcon icon="rocket" />);
    const { container: b } = render(<ProjectFolderIcon icon="bug" />);
    const glyphOf = (root: HTMLElement) => root.querySelector('svg.text-white')?.innerHTML;
    expect(glyphOf(a)).toBeTruthy();
    expect(glyphOf(a)).not.toBe(glyphOf(b));
  });
});
