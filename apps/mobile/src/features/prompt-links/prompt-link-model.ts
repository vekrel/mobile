import type { PromptLinkRepository } from "@vekrel/shared/promptLinks";

export const PROMPT_LINK_PARAM_KEYS = ["prompt", "repo", "pr", "provider", "model"] as const;

type RouteParams = Readonly<Record<string, unknown>> | undefined;

export function promptLinkSearchFromParams(
  params: RouteParams,
  keys: ReadonlyArray<string> = PROMPT_LINK_PARAM_KEYS,
): string | null {
  const search = new URLSearchParams();
  for (const key of keys) {
    const raw = params?.[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === "string") search.set(key, value);
  }
  return search.size > 0 ? search.toString() : null;
}

export function clearedPromptLinkParams(keys: ReadonlyArray<string> = PROMPT_LINK_PARAM_KEYS) {
  return Object.fromEntries(keys.map((key) => [key, undefined]));
}

export function promptLinkNotice(input: {
  readonly hiddenCharacters: number;
  readonly modelUnavailable?: boolean;
  readonly pullRequestUnavailable?: number | null;
}): string {
  return [
    input.hiddenCharacters > 0
      ? "This prompt had hidden characters, it may be malicious. They were removed. Read it before you send."
      : "This prompt came from a link. Read it before you send.",
    input.modelUnavailable
      ? "The requested model is not available, so your default is used."
      : null,
    input.pullRequestUnavailable != null
      ? `Pull request #${input.pullRequestUnavailable} could not be loaded, so this task starts from your default branch.`
      : null,
  ]
    .filter((line) => line !== null)
    .join("\n\n");
}

export function linkedThreadDraftAction(currentText: string, prompt: string) {
  if (currentText.trim().length === 0) return "fill" as const;
  return currentText === prompt ? ("keep" as const) : ("ask" as const);
}

export function promptLinkScratchMachineId<Id extends string>(
  machineIdsMostRecentFirst: ReadonlyArray<Id>,
  scratchMachineIds: ReadonlyArray<Id>,
): Id | null {
  return (
    machineIdsMostRecentFirst.find((id) => scratchMachineIds.includes(id)) ??
    scratchMachineIds[0] ??
    null
  );
}

export function latestThreadMachineIds<Id extends string>(
  threads: ReadonlyArray<{ readonly machineId: Id; readonly updatedAt: string }>,
): ReadonlyArray<Id> {
  const latest = new Map<Id, string>();
  for (const thread of threads) {
    if (thread.updatedAt > (latest.get(thread.machineId) ?? "")) {
      latest.set(thread.machineId, thread.updatedAt);
    }
  }
  return Array.from(latest.keys()).sort((left, right) =>
    (latest.get(right) ?? "").localeCompare(latest.get(left) ?? ""),
  );
}

export const promptLinkRepositoryName = (repository: PromptLinkRepository) =>
  `${repository.owner}/${repository.name}`;
