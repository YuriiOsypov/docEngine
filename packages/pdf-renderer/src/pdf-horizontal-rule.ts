/**
 * pdfmake canvas horizontal rules used for `<hr>` and section border lines.
 */

export function buildPdfHorizontalRuleBlock(
  options: { lineColor?: string; lineWidth?: number; margin?: number[] } = {},
): Record<string, any> {
  const lineColor = options.lineColor ?? '#cccccc';
  const lineWidth = options.lineWidth ?? 0.5;
  const margin = options.margin ?? [0, 6, 0, 6];
  return {
    margin,
    canvas: [
      {
        type: 'line',
        x1: 0,
        y1: 0,
        x2: 515,
        y2: 0,
        lineWidth,
        lineColor,
      },
    ],
  };
}

/** Matches `.document-section--border-top` / `--border-bottom` preview CSS. */
export function buildPdfSectionBorderRuleBlock(side: 'top' | 'bottom'): Record<string, any> {
  return buildPdfHorizontalRuleBlock({
    lineColor: '#000000',
    lineWidth: 1,
    margin: side === 'top' ? [0, 0, 0, 6] : [0, 6, 0, 0],
  });
}

/** Prepend/append optional section border rules around content nodes. */
export function withPdfSectionBorderRules(
  nodes: Record<string, any>[],
  data: { borderTop?: boolean; borderBottom?: boolean } | null | undefined,
): Record<string, any>[] {
  const stack = [...nodes];
  if (data?.borderTop) stack.unshift(buildPdfSectionBorderRuleBlock('top'));
  if (data?.borderBottom) stack.push(buildPdfSectionBorderRuleBlock('bottom'));
  return stack;
}
