export type ProjectedBanner = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  priority: number;
};

export function chooseBannerIds(
  candidates: ProjectedBanner[],
  selectedId: string | null,
  maxVisible: number,
  viewportWidth: number,
  viewportHeight: number,
  gap = 8,
): string[] {
  const ordered = [...candidates].sort((a, b) =>
    Number(b.id === selectedId) - Number(a.id === selectedId)
      || a.priority - b.priority
      || a.id.localeCompare(b.id));
  const accepted: ProjectedBanner[] = [];
  for (const candidate of ordered) {
    if (accepted.length >= maxVisible) break;
    const halfWidth = candidate.width / 2;
    const halfHeight = candidate.height / 2;
    if (candidate.x < halfWidth || candidate.x + halfWidth > viewportWidth
      || candidate.y < halfHeight || candidate.y + halfHeight > viewportHeight) continue;
    const overlaps = accepted.some(other =>
      Math.abs(candidate.x - other.x) < (candidate.width + other.width) / 2 + gap
      && Math.abs(candidate.y - other.y) < (candidate.height + other.height) / 2 + gap);
    if (!overlaps) accepted.push(candidate);
  }
  return accepted.map(candidate => candidate.id);
}
