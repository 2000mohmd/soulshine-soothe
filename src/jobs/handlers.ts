// Job dispatch. Pure routing — the real work stays in the existing *.server.ts
// modules. Every handler must be idempotent.
import type { Job, ServiceClient } from "./types";

export async function runJob(supabase: ServiceClient, job: Job): Promise<void> {
  switch (job.kind) {
    case "summarize_thread": {
      const { findPreviousThread, ensureThreadSummary } =
        await import("@/lib/thread-summary.server");
      const previousThreadId = await findPreviousThread(supabase, job.userId, job.sinceThreadId);
      if (!previousThreadId) {
        // Single ongoing conversation: keep its long-term memory rolling.
        const { ensureRollingSummary } = await import("@/lib/thread-summary.server");
        await ensureRollingSummary(supabase, job.userId, job.sinceThreadId);
        return;
      }
      // ensureThreadSummary is already no-op-if-exists and fail-open. It is also
      // where the Phase 11 session-drift crisis sweep runs — deferring it here
      // does not touch the per-message crisis gate, which runs earlier in
      // sendMessage, before the rate limiter.
      await ensureThreadSummary(supabase, job.userId, previousThreadId);
      return;
    }
    case "effectiveness_recompute": {
      // Keeps effectiveness_insights fresh so the companion's
      // get_effectiveness_insights tool is a plain RLS-scoped read, not an
      // on-demand recompute. Idempotent upsert; safe to run more than once.
      const { computeEffectivenessFor } = await import("@/lib/effectiveness.server");
      await computeEffectivenessFor(supabase, job.userId);
      return;
    }
    default: {
      const exhaustive: never = job;
      throw new Error(`unknown job kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}
