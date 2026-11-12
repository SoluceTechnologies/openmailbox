import { dropIndex, moveItem } from '@/ui/components/ReorderableList';

describe('reorderable list', () => {
  it('moves an item to another position', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('drops a dragged row past every row whose middle it crossed', () => {
    const heights = [60, 80, 60, 60];
    expect(dropIndex(heights, 0, 39)).toBe(0);
    expect(dropIndex(heights, 0, 41)).toBe(1);
    expect(dropIndex(heights, 0, 111)).toBe(2);
    expect(dropIndex(heights, 0, 1_000)).toBe(3);
    expect(dropIndex(heights, 3, -31)).toBe(2);
    expect(dropIndex(heights, 3, -1_000)).toBe(0);
  });
});
