/**
 * pdfmake canvas horizontal rules used for `<hr>` and section border lines.
 */

/** Fallback ≈ A4 content width at 15mm margins; prefer page-aware width when available. */
const DEFAULT_RULE_WIDTH_PT = 515;

export function buildPdfHorizontalRuleBlock(
  options: {
    lineColor?: string;
    lineWidth?: number;
    margin?: number[];
    /** Content area width in pt (page width minus left/right margins). */
    widthPt?: number;
  } = {},
): Record<string, any> {
  const lineColor = options.lineColor ?? '#cccccc';
  const lineWidth = options.lineWidth ?? 0.5;
  const margin = options.margin ?? [0, 6, 0, 6];
  const widthPt =
    Number.isFinite(options.widthPt) && (options.widthPt as number) > 0
      ? Number(options.widthPt)
      : DEFAULT_RULE_WIDTH_PT;
  return {
    margin,
    canvas: [
      {
        type: 'line',
        x1: 0,
        y1: 0,
        x2: widthPt,
        y2: 0,
        lineWidth,
        lineColor,
      },
    ],
  };
}

/** Matches `.document-section--border-top` / `--border-bottom` preview CSS. */
export function buildPdfSectionBorderRuleBlock(
  side: 'top' | 'bottom',
  widthPt?: number,
): Record<string, any> {
  return buildPdfHorizontalRuleBlock({
    lineColor: '#000000',
    lineWidth: 1,
    margin: side === 'top' ? [0, 0, 0, 6] : [0, 6, 0, 0],
    widthPt,
  });
}

/** Prepend/append optional section border rules around content nodes. */
export function withPdfSectionBorderRules(
  nodes: Record<string, any>[],
  data: { borderTop?: boolean; borderBottom?: boolean } | null | undefined,
  widthPt?: number,
): Record<string, any>[] {
  const stack = [...nodes];
  if (data?.borderTop) stack.unshift(buildPdfSectionBorderRuleBlock('top', widthPt));
  if (data?.borderBottom) stack.push(buildPdfSectionBorderRuleBlock('bottom', widthPt));
  return stack;
}
