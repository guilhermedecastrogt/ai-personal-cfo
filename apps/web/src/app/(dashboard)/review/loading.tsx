import type { ReactNode } from 'react';

export default function ReviewLoading(): ReactNode {
  return (
    <p role="status" aria-live="polite" className="text-muted">
      Preparing the review. This can take a few seconds…
    </p>
  );
}
