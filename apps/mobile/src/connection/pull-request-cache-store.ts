import { MachineQueryStore } from "@vekrel/client-runtime/state/query-persistence";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { MobileDatabase } from "../persistence/mobile-database";

export const layer = Layer.effect(
  MachineQueryStore,
  Effect.gen(function* () {
    const database = yield* MobileDatabase;
    return {
      load: (machineId, key) =>
        database
          .loadCache(machineId, "pull-request", `v1:${key}`)
          .pipe(Effect.catch(() => Effect.succeedNone)),
      save: (machineId, key, payload) =>
        database
          .saveCache(machineId, "pull-request", `v1:${key}`, 1, payload)
          .pipe(Effect.catch(() => Effect.logWarning("Offline query database save failed"))),
    } satisfies NonNullable<typeof MachineQueryStore.Service>;
  }),
);
