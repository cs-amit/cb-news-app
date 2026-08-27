export interface ReorderableItem {
  id: string;
  position: number;
}

export function computeReorderedPositions(
  items: ReorderableItem[],
  fromIndex: number,
  toIndex: number
): { id: string; position: number }[] {
  const ordered = [...items].sort((a, b) => a.position - b.position);
  const [moved] = ordered.splice(fromIndex, 1);
  ordered.splice(toIndex, 0, moved);
  return ordered.map((item, index) => ({ id: item.id, position: index }));
}
