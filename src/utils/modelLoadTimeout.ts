/**
 * Per-model load timeout floor for bounded internal model calls.
 *
 * Internal calls (retrieval planning, triage, summaries) carry short fixed
 * budgets. A local server (LM Studio, Ollama) that loads the model on the first
 * request can need longer than that, and aborting the request cancels the load
 * — so the model is unloaded again and the next attempt starts cold. The user
 * sets a load timeout on the model, and every bounded call to it waits at least
 * that long.
 *
 * The configured models live in Zotero prefs, which this module must not reach
 * directly: it is loaded by unit tests where no chrome global exists. The
 * provider store registers the lookup instead; with none registered the floor
 * is zero and callers keep their own budgets.
 */

export type ModelLoadTimeoutLookup = (params: {
  apiBase?: string;
  model?: string;
}) => number | undefined;

let lookup: ModelLoadTimeoutLookup | null = null;

export function registerModelLoadTimeoutLookup(
  next: ModelLoadTimeoutLookup | null,
): void {
  lookup = next;
}

/** The configured load timeout for this model in ms, or 0 when none is set. */
export function resolveModelLoadTimeoutFloorMs(params: {
  apiBase?: string;
  model?: string;
}): number {
  if (!lookup || !params.model) return 0;
  try {
    const seconds = lookup(params);
    return seconds && seconds > 0 ? seconds * 1000 : 0;
  } catch {
    return 0;
  }
}
