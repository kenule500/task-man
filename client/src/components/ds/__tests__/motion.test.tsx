import { act, render, renderHook, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';
import { useReducedMotionSafe } from '@/lib/motion';
import { AnimatedNumber, CheckBurst, Stagger, StaggerItem, TiltCard } from '../motion';
import { DotsLoader, PageLoader, Spinner, TopProgressBar } from '../loaders';

type Listener = () => void;

/** Installs a matchMedia stub; `reduce` and `fine` decide the two queries the motion helpers read. */
const mockMedia = ({ reduce = false, fine = true } = {}) => {
  const listeners = new Set<Listener>();
  const state = { reduce, fine };
  window.matchMedia = jest.fn((query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? state.reduce : state.fine,
    media: query,
    addEventListener: (_: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_: string, listener: Listener) => listeners.delete(listener),
  })) as unknown as typeof window.matchMedia;
  return {
    set: (next: Partial<typeof state>) => {
      Object.assign(state, next);
      listeners.forEach(listener => listener());
    },
  };
};

/** IntersectionObserver that reports every observed element as visible right away. */
class VisibleObserver {
  private readonly callback: IntersectionObserverCallback;
  readonly options?: IntersectionObserverInit;
  // Same signature as the browser's constructor
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
  }
  observe(target: Element) {
    this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
  disconnect() {}
  unobserve() {}
  takeRecords() { return []; }
}

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
  delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
  jest.useRealTimers();
});

describe('useReducedMotionSafe', () => {
  it('is false without matchMedia and follows the OS setting live', () => {
    const { result, unmount } = renderHook(() => useReducedMotionSafe());
    expect(result.current).toBe(false);
    unmount();

    const media = mockMedia({ reduce: false });
    const hook = renderHook(() => useReducedMotionSafe());
    expect(hook.result.current).toBe(false);
    act(() => media.set({ reduce: true }));
    expect(hook.result.current).toBe(true);
  });
});

describe('AnimatedNumber', () => {
  it('renders the final value at once when it cannot observe visibility', () => {
    render(<AnimatedNumber value={42} />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('counts up while visible, exposes the final value to assistive tech and settles on it', () => {
    jest.useFakeTimers();
    mockMedia();
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = VisibleObserver;
    const { container } = render(<AnimatedNumber value={120} duration={400} />);

    // The visible count starts below the target while the screen reader text already has the final value
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('0');
    expect(container.querySelector('.sr-only')).toHaveTextContent('120');
    expect(container.firstElementChild).toHaveClass('tabular-nums');

    act(() => { jest.advanceTimersByTime(200); });
    const midway = Number(container.querySelector('[aria-hidden="true"]')?.textContent);
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(120);

    act(() => { jest.advanceTimersByTime(400); });
    expect(container.querySelector('.sr-only')).toBeNull();
    expect(screen.getByText('120')).toBeInTheDocument();
  });

  it('skips the count-up when the user prefers reduced motion', () => {
    mockMedia({ reduce: true });
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = VisibleObserver;
    const { container } = render(<AnimatedNumber value={7} />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(screen.getByText('7')).toBeInTheDocument();
  });
});

describe('Spinner and loaders', () => {
  it('is a labelled status by default and can be decorative', () => {
    const { rerender } = render(<Spinner />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();

    rerender(<Spinner label="Loading members" />);
    expect(screen.getByRole('status', { name: 'Loading members' })).toBeInTheDocument();

    rerender(<Spinner decorative />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('labels the dots, the top bar and the page loader', () => {
    render(<><DotsLoader label="Saving" /><TopProgressBar /><PageLoader /></>);
    expect(screen.getByRole('status', { name: 'Saving' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Loading page' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });
});

describe('Button loading', () => {
  it('disables the button, marks it busy and keeps its label in the accessibility tree', () => {
    const onClick = jest.fn();
    const { rerender } = render(<Button onClick={onClick}>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).not.toHaveAttribute('aria-busy');

    rerender(<Button loading onClick={onClick}>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button.querySelector('[data-slot="spinner"]')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Stagger', () => {
  it('delays each item by 45ms and caps the delay', () => {
    render(
      <Stagger>
        {Array.from({ length: 14 }, (_, index) => <StaggerItem key={index}>{`Item ${index}`}</StaggerItem>)}
      </Stagger>,
    );
    expect(screen.getByText('Item 0')).toHaveStyle({ animationDelay: '0ms' });
    expect(screen.getByText('Item 2')).toHaveStyle({ animationDelay: '90ms' });
    expect(screen.getByText('Item 13')).toHaveStyle({ animationDelay: '450ms' });
  });
});

describe('TiltCard and CheckBurst', () => {
  it('tilts with a sheen only for a fine pointer without reduced motion', () => {
    mockMedia({ reduce: false, fine: true });
    const { container, unmount } = render(<TiltCard>Card</TiltCard>);
    expect(container.querySelector('span[aria-hidden]')).toBeInTheDocument();
    unmount();

    mockMedia({ reduce: true, fine: true });
    const reduced = render(<TiltCard>Card</TiltCard>);
    expect(reduced.container.querySelector('span[aria-hidden]')).toBeNull();
    reduced.unmount();

    mockMedia({ reduce: false, fine: false });
    const touch = render(<TiltCard>Card</TiltCard>);
    expect(touch.container.querySelector('span[aria-hidden]')).toBeNull();
  });

  it('plays the burst unless motion is reduced', () => {
    mockMedia({ reduce: false });
    const { unmount } = render(<CheckBurst />);
    expect(screen.getByTestId('check-burst')).toBeInTheDocument();
    unmount();

    mockMedia({ reduce: true });
    render(<CheckBurst />);
    expect(screen.queryByTestId('check-burst')).not.toBeInTheDocument();
  });
});
