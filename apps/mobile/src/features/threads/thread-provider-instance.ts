import { useMemo } from "react";

import type { MachineThreadShell } from "@vekrel/client-runtime/state/shell";
import {
  normalizeProviderAccentColor,
  resolveProviderInstanceDisplayName,
  shouldShowInstanceBadge,
} from "@vekrel/client-runtime/state/provider-instance-display";
import type { MachineId, ProviderDriverKind } from "@vekrel/contracts";

import type { ThreadListProvider } from "../../state/thread-list-machines";
export interface ThreadRowProviderInstance {
  readonly driverKind: ProviderDriverKind;
  readonly displayName: string;
  readonly accentColor?: string | undefined;
  readonly showBadge: boolean;
}

/**
 * Resolve the provider instance a thread runs on, scoped to the thread's own
 * machine: default instance ids are the driver slug, so the same id
 * names a different account on every server.
 */
export function resolveThreadProviderInstance(
  providers: ReadonlyArray<ThreadListProvider> | undefined,
  thread: MachineThreadShell,
): ThreadRowProviderInstance | null {
  if (providers === undefined) return null;
  const instanceId = thread.runtime?.providerInstanceId ?? thread.modelSelection.instanceId;
  const snapshot = providers.find((provider) => provider.instanceId === instanceId);
  if (!snapshot) return null;
  const entry = {
    driverKind: snapshot.driver,
    displayName: resolveProviderInstanceDisplayName(snapshot),
    accentColor: normalizeProviderAccentColor(snapshot.accentColor),
  };
  return {
    ...entry,
    showBadge: shouldShowInstanceBadge(
      { ...entry, enabled: snapshot.enabled },
      providers.map((provider) => ({ driverKind: provider.driver, enabled: provider.enabled })),
    ),
  };
}

/**
 * `resolveThreadProviderInstance` builds a fresh object per call, which breaks
 * the memoized row's props comparison on every parent render — the result only
 * depends on (machine, instance id), so one cache per provider-list
 * generation keeps each row's `providerInstance` prop stable until the instance
 * behind the row actually changes.
 */
export function createThreadRowProviderInstanceResolver(
  providersByMachineId: ReadonlyMap<MachineId, ReadonlyArray<ThreadListProvider>>,
): (thread: MachineThreadShell) => ThreadRowProviderInstance | null {
  const cache = new Map<string, ThreadRowProviderInstance | null>();
  return (thread) => {
    const instanceId = thread.runtime?.providerInstanceId ?? thread.modelSelection.instanceId;
    const cacheKey = `${thread.machineId}|${instanceId ?? ""}`;
    const cached = cache.get(cacheKey);
    if (cached !== undefined) return cached;
    const resolved = resolveThreadProviderInstance(
      providersByMachineId.get(thread.machineId),
      thread,
    );
    cache.set(cacheKey, resolved);
    return resolved;
  };
}

export function useThreadRowProviderInstanceResolver(
  providersByMachineId: ReadonlyMap<MachineId, ReadonlyArray<ThreadListProvider>>,
): (thread: MachineThreadShell) => ThreadRowProviderInstance | null {
  return useMemo(
    () => createThreadRowProviderInstanceResolver(providersByMachineId),
    [providersByMachineId],
  );
}
