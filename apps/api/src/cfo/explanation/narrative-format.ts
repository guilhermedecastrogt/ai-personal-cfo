import type { ReviewNarrative } from '../../ai/review/review-narrative.schema.js';

const STRENGTH_MARK = '✓';
const CONCERN_MARK = '!';
const RECOMMENDATION_MARK = '→';

function marked(mark: string, points: readonly string[]): string {
  return points.map((point) => `${mark} ${point}`).join('\n');
}

function numbered(points: readonly string[]): string {
  return points.map((point, index) => `${String(index + 1)}. ${point}`).join('\n');
}

export function formatNarrative(narrative: ReviewNarrative): string {
  return [
    narrative.summary,
    marked(STRENGTH_MARK, narrative.strengths),
    marked(CONCERN_MARK, narrative.concerns),
    marked(RECOMMENDATION_MARK, narrative.recommendations),
    numbered(narrative.priorities),
  ]
    .filter((section) => section !== '')
    .join('\n\n');
}
