import { BOARD_PAGE_SIZE, pageCount, paginate } from '../lib/pagination';

const items = Array.from({ length: 23 }, (_, index) => index);

describe('paginate', () => {
  it('shows the first page of a long list', () => {
    const page = paginate(items, 1, 10);
    expect(page.visible).toEqual(items.slice(0, 10));
    expect(page).toMatchObject({ shown: 10, total: 23, hasMore: true, remaining: 13 });
  });

  it('is cumulative: page 2 shows 20, page 3 shows everything', () => {
    expect(paginate(items, 2, 10)).toMatchObject({ shown: 20, remaining: 3, hasMore: true });
    const last = paginate(items, 3, 10);
    expect(last.visible).toEqual(items);
    expect(last).toMatchObject({ shown: 23, remaining: 0, hasMore: false });
  });

  it('handles short and empty lists', () => {
    expect(paginate([1, 2, 3], 1, 10)).toMatchObject({ shown: 3, total: 3, hasMore: false, remaining: 0 });
    expect(paginate([], 1, 10)).toMatchObject({ visible: [], shown: 0, total: 0, hasMore: false, remaining: 0 });
  });

  it('clamps invalid page and size, and defaults to BOARD_PAGE_SIZE', () => {
    expect(paginate(items, 0, 10).shown).toBe(10);
    expect(paginate(items, -2, 10).shown).toBe(10);
    expect(paginate(items, 1, 0).shown).toBe(1);
    expect(paginate(items, 1).shown).toBe(BOARD_PAGE_SIZE);
  });

  it('counts the pages needed to show everything', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(10)).toBe(1);
    expect(pageCount(23)).toBe(3);
    expect(paginate(items, pageCount(items.length)).hasMore).toBe(false);
  });
});
