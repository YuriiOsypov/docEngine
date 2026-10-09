export type LogicalTrueMark = 'yesNo' | 'x' | 'check';

/** Normalize stored / form values to a known true-mark mode. */
export function normalizeLogicalTrueMark(value: unknown): LogicalTrueMark {
  if (value === 'x' || value === 'X') return 'x';
  if (value === 'check' || value === '✓') return 'check';
  return 'yesNo';
}

/** Plain-text display for export / PDF / formatFieldDisplay. */
export function formatLogicalDisplay(
  value: unknown,
  trueMark: unknown,
  emptyLabel = '',
): string {
  if (value !== true && value !== false) return emptyLabel;
  const mark = normalizeLogicalTrueMark(trueMark);
  if (mark === 'x') return value ? 'X' : '';
  if (mark === 'check') return value ? '✓' : '';
  return value ? 'Yes' : 'No';
}

/** Inline token label (Yes/No mode keeps the check accent on true). */
export function formatLogicalTokenDisplay(value: boolean, trueMark: unknown): string {
  const mark = normalizeLogicalTrueMark(trueMark);
  if (mark === 'x') return value ? 'X' : '';
  if (mark === 'check') return value ? '✓' : '';
  return value ? 'Yes ✓' : 'No';
}
