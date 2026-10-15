import { stepColumn, swipeStep } from '../lib/columnSwipe';

describe('swipeStep', () => {
  it('swipe left = next column, swipe right = previous', () => {
    expect(swipeStep(-80, 5)).toBe(1);
    expect(swipeStep(80, -5)).toBe(-1);
  });

  it('ignores short movements', () => {
    expect(swipeStep(-59, 0)).toBe(0);
    expect(swipeStep(60, 0)).toBe(-1);
  });

  it('ignores mostly vertical (scroll) movements', () => {
    expect(swipeStep(-70, 120)).toBe(0);
    expect(swipeStep(-90, 50)).toBe(1);
  });
});

describe('stepColumn', () => {
  const columns = ['a', 'b', 'c'];
  it('moves and clamps at both ends', () => {
    expect(stepColumn(columns, 'a', 1)).toBe('b');
    expect(stepColumn(columns, 'c', 1)).toBe('c');
    expect(stepColumn(columns, 'a', -1)).toBe('a');
    expect(stepColumn(columns, 'b', 0)).toBe('b');
  });
});
