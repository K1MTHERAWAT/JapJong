import { describe, expect, it } from 'vitest';
import { ITEMS_PER_GOV_FORM_PAGE, chunkDocumentItems } from './print';

describe('chunkDocumentItems', () => {
  it('defaults to 3 items per page', () => {
    expect(ITEMS_PER_GOV_FORM_PAGE).toBe(3);
  });

  it('keeps 1-3 items on a single page', () => {
    expect(chunkDocumentItems(['a'])).toEqual([['a']]);
    expect(chunkDocumentItems(['a', 'b', 'c'])).toEqual([['a', 'b', 'c']]);
  });

  it('splits item 4 onto page 2 so numbering restarts at 1 on the new page', () => {
    const pages = chunkDocumentItems(['ข้อ 1', 'ข้อ 2', 'ข้อ 3', 'ข้อ 4']);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toEqual(['ข้อ 1', 'ข้อ 2', 'ข้อ 3']);
    expect(pages[1]).toEqual(['ข้อ 4']);
  });

  it('handles 7 items across 3 pages (3, 3, 1)', () => {
    const pages = chunkDocumentItems([1, 2, 3, 4, 5, 6, 7]);
    expect(pages).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
  });
});
