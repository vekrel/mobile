import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";

import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { DEFAULT_PR_LIST_CONTROLS, type PullRequestListControls } from "./pullRequestList";

export function usePullRequestListControls() {
  const preferences = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const saved = AsyncResult.isSuccess(preferences)
    ? preferences.value.pullRequestListFilters
    : undefined;
  const machineId = saved?.machineId ?? null;
  const controlsFor = (machine: string | null) =>
    saved?.controls[machine ?? ""] ?? DEFAULT_PR_LIST_CONTROLS;
  const setMachineId = (next: string | null) =>
    savePreferences({
      transform: (current) => ({
        pullRequestListFilters: {
          controls: current.pullRequestListFilters?.controls ?? {},
          machineId: next,
        },
      }),
    });
  const setControls = (machine: string | null, controls: PullRequestListControls) =>
    savePreferences({
      transform: (current) => ({
        pullRequestListFilters: {
          machineId: current.pullRequestListFilters?.machineId ?? null,
          controls: withMachineControls(
            current.pullRequestListFilters?.controls,
            machine ?? "",
            controls,
          ),
        },
      }),
    });
  return { machineId, controlsFor, setMachineId, setControls } as const;
}

function withMachineControls(
  saved: Readonly<Record<string, PullRequestListControls>> | undefined,
  machine: string,
  controls: PullRequestListControls,
): Record<string, PullRequestListControls> {
  return { ...saved, [machine]: controls };
}
