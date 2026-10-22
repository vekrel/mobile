import {
  ORCHESTRATION_CACHE_SCHEMA_VERSION,
  ORCHESTRATION_THREAD_CACHE_SCHEMA_VERSION,
  StoredOrchestrationThreadSnapshot,
  Persistence,
  makeStoredShellSnapshotEncoder,
} from "@vekrel/client-runtime/platform";
import { type MachineId, ServerConfig, VcsListRefsResult } from "@vekrel/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as MobileDatabase from "../persistence/mobile-database";
import {
  attachProjectFaviconDatabase,
  projectFaviconDatabaseCache,
} from "../lib/projectFaviconDatabaseCache";
import { decodeStoredShellSnapshot } from "./shell-cache-decoding";

const SERVER_CONFIG_CACHE_SCHEMA_VERSION = 1;
const VCS_REFS_CACHE_SCHEMA_VERSION = 1;

const StoredServerConfig = Schema.Struct({
  schemaVersion: Schema.Literal(SERVER_CONFIG_CACHE_SCHEMA_VERSION),
  machineId: Schema.String,
  config: ServerConfig,
});
const StoredVcsRefs = Schema.Struct({
  schemaVersion: Schema.Literal(VCS_REFS_CACHE_SCHEMA_VERSION),
  machineId: Schema.String,
  cwd: Schema.String,
  refs: VcsListRefsResult,
});

const decodeStoredThreadSnapshot = Schema.decodeUnknownEffect(
  Schema.fromJsonString(StoredOrchestrationThreadSnapshot),
);
const encodeStoredThreadSnapshot = Schema.encodeEffect(
  Schema.fromJsonString(StoredOrchestrationThreadSnapshot),
);
const decodeStoredServerConfig = Schema.decodeUnknownEffect(
  Schema.fromJsonString(StoredServerConfig),
);
const encodeStoredServerConfig = Schema.encodeEffect(Schema.fromJsonString(StoredServerConfig));
const decodeStoredVcsRefs = Schema.decodeUnknownEffect(Schema.fromJsonString(StoredVcsRefs));
const encodeStoredVcsRefs = Schema.encodeEffect(Schema.fromJsonString(StoredVcsRefs));

type CacheOperation = Persistence.ConnectionPersistenceError["operation"];

function persistenceError(operation: CacheOperation, cause: unknown) {
  return new Persistence.ConnectionPersistenceError({
    operation,
    message: `Could not ${operation.replaceAll("-", " ")}: ${String(cause)}`,
  });
}

function mapDatabaseError(operation: CacheOperation) {
  return (error: MobileDatabase.MobileDatabaseError) => persistenceError(operation, error);
}

function loadDecodedCache<A, B>(input: {
  readonly database: MobileDatabase.MobileDatabase["Service"];
  readonly machineId: MachineId;
  readonly kind: MobileDatabase.ClientCacheKind;
  readonly cacheKey: string;
  readonly operation: CacheOperation;
  readonly decode: (raw: string) => Effect.Effect<A, unknown>;
  readonly select: (value: A) => Option.Option<B>;
}): Effect.Effect<Option.Option<B>, Persistence.ConnectionPersistenceError> {
  return input.database.loadCache(input.machineId, input.kind, input.cacheKey).pipe(
    Effect.mapError(mapDatabaseError(input.operation)),
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.succeed(Option.none<B>()),
        onSome: (raw) =>
          input.decode(raw).pipe(
            Effect.map(input.select),
            Effect.catch((cause) =>
              Effect.logWarning("Discarding corrupt mobile client cache record.", {
                machineId: input.machineId,
                kind: input.kind,
                cacheKey: input.cacheKey,
                cause: String(cause),
              }).pipe(
                Effect.andThen(
                  input.database
                    .removeCache(input.machineId, input.kind, input.cacheKey)
                    .pipe(Effect.catch(() => Effect.void)),
                ),
                Effect.as(Option.none<B>()),
              ),
            ),
          ),
      }),
    ),
  );
}

export const make = Effect.fn("MobileMachineCacheStore.make")(function* () {
  const database = yield* MobileDatabase.MobileDatabase;
  attachProjectFaviconDatabase(database);
  const encodeStoredShellSnapshot = makeStoredShellSnapshotEncoder();
  return Persistence.MachineCacheStore.of({
    loadShell: Effect.fn("MobileMachineCache.loadShell")((machineId) =>
      loadDecodedCache({
        database,
        machineId,
        kind: "shell",
        cacheKey: "snapshot",
        operation: "load-shell",
        decode: decodeStoredShellSnapshot,
        select: (stored) =>
          stored.machineId === machineId ? Option.some(stored.snapshot) : Option.none(),
      }).pipe(
        Effect.zipWith(
          Effect.promise(() => projectFaviconDatabaseCache.hydrate()),
          (snapshot) => snapshot,
          { concurrent: true },
        ),
      ),
    ),
    saveShell: Effect.fn("MobileMachineCache.saveShell")(function* (machineId, snapshot) {
      const payload = yield* encodeStoredShellSnapshot({
        schemaVersion: ORCHESTRATION_CACHE_SCHEMA_VERSION,
        machineId,
        snapshot,
      }).pipe(Effect.mapError((cause) => persistenceError("save-shell", cause)));
      yield* database
        .saveCache(machineId, "shell", "snapshot", ORCHESTRATION_CACHE_SCHEMA_VERSION, payload)
        .pipe(Effect.mapError(mapDatabaseError("save-shell")));
    }),
    loadThread: Effect.fn("MobileMachineCache.loadThread")((machineId, threadId) =>
      loadDecodedCache({
        database,
        machineId,
        kind: "thread",
        cacheKey: threadId,
        operation: "load-thread",
        decode: decodeStoredThreadSnapshot,
        select: (stored) =>
          stored.machineId === machineId && stored.threadId === threadId
            ? Option.some(stored.snapshot)
            : Option.none(),
      }),
    ),
    saveThread: Effect.fn("MobileMachineCache.saveThread")(function* (machineId, snapshot) {
      const threadId = snapshot.projection.thread.id;
      const payload = yield* encodeStoredThreadSnapshot({
        schemaVersion: ORCHESTRATION_THREAD_CACHE_SCHEMA_VERSION,
        machineId,
        threadId,
        snapshot,
      }).pipe(Effect.mapError((cause) => persistenceError("save-thread", cause)));
      yield* database
        .saveCache(
          machineId,
          "thread",
          threadId,
          ORCHESTRATION_THREAD_CACHE_SCHEMA_VERSION,
          payload,
        )
        .pipe(Effect.mapError(mapDatabaseError("save-thread")));
    }),
    removeThread: Effect.fn("MobileMachineCache.removeThread")((machineId, threadId) =>
      database
        .removeCache(machineId, "thread", threadId)
        .pipe(Effect.mapError(mapDatabaseError("remove-thread"))),
    ),
    loadServerConfig: Effect.fn("MobileMachineCache.loadServerConfig")((machineId) =>
      loadDecodedCache({
        database,
        machineId,
        kind: "server-config",
        cacheKey: "config",
        operation: "load-server-config",
        decode: decodeStoredServerConfig,
        select: (stored) =>
          stored.machineId === machineId ? Option.some(stored.config) : Option.none(),
      }),
    ),
    saveServerConfig: Effect.fn("MobileMachineCache.saveServerConfig")(
      function* (machineId, config) {
        const payload = yield* encodeStoredServerConfig({
          schemaVersion: SERVER_CONFIG_CACHE_SCHEMA_VERSION,
          machineId,
          config,
        }).pipe(Effect.mapError((cause) => persistenceError("save-server-config", cause)));
        yield* database
          .saveCache(
            machineId,
            "server-config",
            "config",
            SERVER_CONFIG_CACHE_SCHEMA_VERSION,
            payload,
          )
          .pipe(Effect.mapError(mapDatabaseError("save-server-config")));
      },
    ),
    loadVcsRefs: Effect.fn("MobileMachineCache.loadVcsRefs")((machineId, cwd) =>
      loadDecodedCache({
        database,
        machineId,
        kind: "vcs-refs",
        cacheKey: cwd,
        operation: "load-vcs-refs",
        decode: decodeStoredVcsRefs,
        select: (stored) =>
          stored.machineId === machineId && stored.cwd === cwd
            ? Option.some(stored.refs)
            : Option.none(),
      }),
    ),
    saveVcsRefs: Effect.fn("MobileMachineCache.saveVcsRefs")(
      function* (machineId, cwd, refs) {
        const payload = yield* encodeStoredVcsRefs({
          schemaVersion: VCS_REFS_CACHE_SCHEMA_VERSION,
          machineId,
          cwd,
          refs,
        }).pipe(Effect.mapError((cause) => persistenceError("save-vcs-refs", cause)));
        yield* database
          .saveCache(machineId, "vcs-refs", cwd, VCS_REFS_CACHE_SCHEMA_VERSION, payload)
          .pipe(Effect.mapError(mapDatabaseError("save-vcs-refs")));
      },
    ),
    removeVcsRefs: Effect.fn("MobileMachineCache.removeVcsRefs")((machineId, cwd) =>
      database
        .removeCache(machineId, "vcs-refs", cwd)
        .pipe(Effect.mapError(mapDatabaseError("remove-vcs-refs"))),
    ),
    clearVcsRefs: Effect.fn("MobileMachineCache.clearVcsRefs")((machineId) =>
      database
        .clearCacheKind(machineId, "vcs-refs")
        .pipe(Effect.mapError(mapDatabaseError("clear-vcs-refs"))),
    ),
    clear: Effect.fn("MobileMachineCache.clear")((machineId) =>
      Effect.promise(() => projectFaviconDatabaseCache.clearMachine(machineId)).pipe(
        Effect.andThen(database.clearMachineCache(machineId)),
        Effect.mapError(mapDatabaseError("clear-machine")),
      ),
    ),
  });
});

export const layer = Layer.effect(Persistence.MachineCacheStore, make());
