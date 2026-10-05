import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AI_PROVIDER,
  AIProviderError,
  type AIProvider,
  type ReviewExplanationRequest,
} from '../../ai/ai-provider.js';
import { findUnverifiedFigures } from '../../ai/reply/reply-guard.js';
import {
  reviewNarrativeWireSchema,
  type ReviewNarrative,
} from '../../ai/review/review-narrative.schema.js';
import { normalizeAssistantVoice } from '../../ai/voice.js';
import { renderDeterministicNarrative } from './deterministic-narrative.js';

export type NarrativeSource = 'AI' | 'DETERMINISTIC';

export interface ExplainedReview {
  readonly narrative: ReviewNarrative;
  readonly source: NarrativeSource;
}

const MAXIMUM_SUMMARY_LENGTH = 900;
const MAXIMUM_POINT_LENGTH = 400;
const MAXIMUM_POINTS = 5;

@Injectable()
export class ReviewExplainer {
  private readonly logger = new Logger(ReviewExplainer.name);

  constructor(@Inject(AI_PROVIDER) private readonly provider: AIProvider) {}

  async explain(request: ReviewExplanationRequest): Promise<ExplainedReview> {
    try {
      const narrative = validate(await this.provider.explainMonthlyReview(request), request);
      return typeof narrative === 'string'
        ? this.fallback(request, narrative)
        : { narrative, source: 'AI' };
    } catch (error) {
      if (error instanceof AIProviderError) {
        return this.fallback(request, error.category);
      }
      throw error;
    }
  }

  private fallback(request: ReviewExplanationRequest, reason: string): ExplainedReview {
    this.logger.warn(`Review narrative replaced by deterministic fallback: reason=${reason}`);
    return { narrative: renderDeterministicNarrative(request.reviews), source: 'DETERMINISTIC' };
  }
}

function validate(output: unknown, request: ReviewExplanationRequest): ReviewNarrative | string {
  const parsed = reviewNarrativeWireSchema.safeParse(output);
  if (!parsed.success) {
    return 'invalid-structure';
  }
  const narrative = tidy(parsed.data);
  const lists = [
    narrative.strengths,
    narrative.concerns,
    narrative.recommendations,
    narrative.priorities,
  ];
  const points = lists.flat();
  const isWithinLimits =
    narrative.summary !== '' &&
    narrative.summary.length <= MAXIMUM_SUMMARY_LENGTH &&
    lists.every((list) => list.length <= MAXIMUM_POINTS) &&
    points.every((point) => point.length <= MAXIMUM_POINT_LENGTH);
  if (!isWithinLimits) {
    return 'outside-limits';
  }
  const unverified = findUnverifiedFigures(
    [narrative.summary, ...points].join('\n'),
    { reviews: request.reviews },
    request.userMessage ?? '',
  );
  return unverified.length === 0 ? narrative : 'unverified-figure';
}

function tidy(narrative: ReviewNarrative): ReviewNarrative {
  const clean = (points: readonly string[]): string[] =>
    points.map((point) => normalizeAssistantVoice(point).trim()).filter((point) => point !== '');
  return {
    summary: normalizeAssistantVoice(narrative.summary).trim(),
    strengths: clean(narrative.strengths),
    concerns: clean(narrative.concerns),
    recommendations: clean(narrative.recommendations),
    priorities: clean(narrative.priorities),
  };
}
