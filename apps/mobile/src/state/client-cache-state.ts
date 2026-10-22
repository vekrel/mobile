import type { MachineId } from "@vekrel/contracts";
import * as Effect from "effect/Effect";
import { Atom } from "effect/reactivity";

import * as MobileDatabase from "../persistence/mobile-database";
import { projectFaviconDatabaseCache } from "../lib/projectFaviconDatabaseCache";
import * as Runtime from "../lib/runtime";

export interface MachineClientCacheSummary {
  readonly machineId: MachineId;
  readonly recordCount: number;
  readonly payloadBytes: number;
  readonly kinds: Readonly<Partial<Record<MobileDatabase.ClientCacheKind, number>>>;
}

export interface ClientCacheSummary {
  readonly recordCount: number;
  readonly payloadBytes: number;
  readonly machines: ReadonlyArray<MachineClientCacheSummary>;
}

export type ClientCacheClearScope =
  | { readonly type: "all" }
  | { readonly type: "machine"; readonly machineId: MachineId };

function aggregateCacheSummary(
  rows: ReadonlyArray<{
    readonly machineId: MachineId;
    readonly kind: MobileDatabase.ClientCacheKind;
    readonly recordCount: number;
    readonly payloadBytes: number;
  }>,
): ClientCacheSummary {
  const machines = new Map<MachineId, MachineClientCacheSummary>();
  let recordCount = 0;
  let payloadBytes = 0;

  for (const row of rows) {
    recordCount += row.recordCount;
    payloadBytes += row.payloadBytes;
    const current = machines.get(row.machineId) ?? {
      machineId: row.machineId,
      recordCount: 0,
      payloadBytes: 0,
      kinds: {},
    };
    machines.set(row.machineId, {
      machineId: row.machineId,
      recordCount: current.recordCount + row.recordCount,
      payloadBytes: current.payloadBytes + row.payloadBytes,
      kinds: { ...current.kinds, [row.kind]: row.recordCount },
    });
  }

  return {
    recordCount,
    payloadBytes,
    machines: [...machines.values()],
  };
}

const clientCacheRuntime = Atom.runtime(Runtime.layer);

export const clientCacheSummaryAtom = clientCacheRuntime
  .atom(
    MobileDatabase.MobileDatabase.pipe(
      Effect.flatMap((database) => database.inspectCaches),
      Effect.map(aggregateCacheSummary),
    ),
  )
  .pipe(Atom.withLabel("mobile:client-cache:summary"));

export const clearClientCacheAtom = clientCacheRuntime
  .fn((scope: ClientCacheClearScope, get) =>
    Effect.promise(() =>
      scope.type === "all"
        ? projectFaviconDatabaseCache.clearAll()
        : projectFaviconDatabaseCache.clearMachine(scope.machineId),
    ).pipe(
      Effect.andThen(MobileDatabase.MobileDatabase),
      Effect.flatMap((database) =>
        scope.type === "all"
          ? database.clearAllCaches
          : database.clearMachineCache(scope.machineId),
      ),
      Effect.tap(() =>
        Effect.sync(() => {
          get.refresh(clientCacheSummaryAtom);
        }),
      ),
    ),
  )
  .pipe(Atom.withLabel("mobile:client-cache:clear"));
