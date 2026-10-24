import * as Effect from "effect/Effect";
import type { MachineId } from "@vekrel/contracts";

import type { SavedRemoteConnection } from "../../lib/connection";
import { linkMachineToCloudWithPreference } from "../cloud/linkMachine";
import { updateAgentAwarenessRegistrationPreferences } from "./remoteRegistration";

export const setLiveActivityUpdatesEnabled = Effect.fn("setLiveActivityUpdatesEnabled")(
  function* (input: {
    readonly enabled: boolean;
    readonly previousEnabled: boolean;
    readonly accountToken: string | null;
    readonly connections: ReadonlyArray<SavedRemoteConnection>;
    readonly canConfigureMachine: (machineId: MachineId) => boolean;
  }) {
    const linkedConnections = input.connections.filter(
      (connection) => connection.bearerToken !== null,
    );

    const updateMachinePreference = Effect.fn("updateMachinePreference")(function* (
      connection: SavedRemoteConnection,
      enabled: boolean,
      accountToken: string,
    ) {
      if (!input.canConfigureMachine(connection.machineId)) return;

      yield* linkMachineToCloudWithPreference({
        accountToken,
        connection,
        liveActivitiesEnabled: enabled,
      });
    });

    const updateRelayPreference = Effect.fn("updateRelayPreference")(function* (enabled: boolean) {
      yield* updateAgentAwarenessRegistrationPreferences({
        liveActivitiesEnabled: enabled,
      });

      const accountToken = input.accountToken;
      if (!accountToken) return;

      yield* Effect.forEach(
        linkedConnections,
        (connection) => updateMachinePreference(connection, enabled, accountToken),
        { concurrency: "unbounded" },
      );
    });

    const restoreRelayPreference = Effect.fn("restoreRelayPreference")(function* () {
      yield* updateAgentAwarenessRegistrationPreferences({
        liveActivitiesEnabled: input.previousEnabled,
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("Could not restore Live Activity device preference.", cause),
        ),
      );

      const accountToken = input.accountToken;
      if (!accountToken) return;

      yield* Effect.forEach(
        linkedConnections,
        (connection) =>
          updateMachinePreference(connection, input.previousEnabled, accountToken).pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning(
                `Could not restore Live Activity preference for machine ${connection.machineId}.`,
                cause,
              ),
            ),
          ),
        { concurrency: "unbounded" },
      );
    });

    yield* updateRelayPreference(input.enabled).pipe(
      Effect.onError(() => restoreRelayPreference()),
    );
  },
);
