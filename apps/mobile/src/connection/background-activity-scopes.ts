import type { MachineRpcSubscriptionObservation } from "@vekrel/client-runtime/rpc";
import { type BackgroundScope, type MachineId, WS_METHODS } from "@vekrel/contracts";
import * as Effect from "effect/Effect";

interface RetainedScope {
  readonly machineId: MachineId;
  readonly scope: BackgroundScope;
  refCount: number;
}

const retainedScopes = new Map<string, RetainedScope>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {}
  }
}

function stableScopeKey(machineId: MachineId, scope: BackgroundScope): string {
  switch (scope.type) {
    case "server-config":
    case "diagnostics":
      return JSON.stringify([machineId, scope.type]);
    case "provider-status":
      return JSON.stringify([machineId, scope.type, scope.instanceId ?? null]);
    case "vcs-status":
    case "git-refs":
      return JSON.stringify([machineId, scope.type, scope.cwd]);
    case "thread":
      return JSON.stringify([machineId, scope.type, scope.threadId]);
  }
}

function scopeForSubscription(
  observation: MachineRpcSubscriptionObservation,
): BackgroundScope | null {
  if (observation.method === WS_METHODS.subscribeResourceTelemetry) {
    return { type: "diagnostics" };
  }
  if (observation.method !== WS_METHODS.subscribeVcsStatus) {
    return null;
  }
  const input = observation.input as { readonly cwd?: unknown; readonly includeRemote?: unknown };
  if (input.includeRemote === false) return null;
  return typeof input.cwd === "string" ? { type: "vcs-status", cwd: input.cwd } : null;
}

export function retainedMobileBackgroundScopes(
  machineId: MachineId,
): ReadonlyArray<BackgroundScope> {
  return Array.from(retainedScopes.values(), (entry) =>
    entry.machineId === machineId ? entry.scope : null,
  ).filter((scope): scope is BackgroundScope => scope !== null);
}

export function observeMobileBackgroundActivitySubscription(
  observation: MachineRpcSubscriptionObservation,
): Effect.Effect<Effect.Effect<void>> {
  const scope = scopeForSubscription(observation);
  if (scope === null) return Effect.succeed(Effect.void);
  return Effect.sync(() => {
    const machineId = observation.machineId as MachineId;
    const key = stableScopeKey(machineId, scope);
    const current = retainedScopes.get(key);
    if (current) {
      current.refCount += 1;
    } else {
      retainedScopes.set(key, { machineId, scope, refCount: 1 });
      notify();
    }
    return Effect.sync(() => {
      const retained = retainedScopes.get(key);
      if (!retained) return;
      retained.refCount -= 1;
      if (retained.refCount <= 0) {
        retainedScopes.delete(key);
        notify();
      }
    });
  });
}

export function onRetainedMobileBackgroundScopesChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
