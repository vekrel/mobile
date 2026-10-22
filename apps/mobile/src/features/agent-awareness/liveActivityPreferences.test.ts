import { beforeEach, vi } from "vite-plus/test";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { MachineId } from "@vekrel/contracts";
import { ManagedRelay } from "@vekrel/client-runtime/relay";
import * as Layer from "effect/Layer";
import { HttpClient } from "effect/http";

import type { SavedRemoteConnection } from "../../lib/connection";
import * as MobileStorage from "../../persistence/mobile-storage";
import {
  CloudMachineLinkError,
  linkMachineToCloudWithPreference,
} from "../cloud/linkMachine";
import { setLiveActivityUpdatesEnabled } from "./liveActivityPreferences";
import { updateAgentAwarenessRegistrationPreferences } from "./remoteRegistration";

vi.mock("expo-secure-store", () => ({
  deleteItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

vi.mock("expo-constants", () => ({
  default: { expoConfig: {} },
}));

vi.mock("expo-device", () => ({}));

vi.mock("../cloud/linkMachine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../cloud/linkMachine")>()),
  linkMachineToCloudWithPreference: vi.fn(() => Effect.void),
}));

vi.mock("./remoteRegistration", () => ({
  updateAgentAwarenessRegistrationPreferences: vi.fn(() => Effect.void),
}));

const connection: SavedRemoteConnection = {
  machineId: "env-1" as MachineId,
  machineLabel: "Desktop",
  pairingUrl: "https://desktop.example.test/",
  displayUrl: "https://desktop.example.test/",
  httpBaseUrl: "https://desktop.example.test/",
  wsBaseUrl: "wss://desktop.example.test/ws",
  bearerToken: "local-bearer",
};

const layerTest = Layer.mergeAll(
  Layer.succeed(ManagedRelay.ManagedRelayClient, null as never),
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make(() => Effect.die("unexpected HTTP request")),
  ),
  Layer.succeed(
    MobileStorage.MobileStorage,
    MobileStorage.MobileStorage.of({
      loadSavedConnections: Effect.succeed([]),
      saveConnection: () => Effect.void,
      clearSavedConnection: () => Effect.void,
      loadOrCreateAgentAwarenessDeviceId: Effect.succeed("device-1"),
      loadAgentAwarenessDeviceId: Effect.succeed("device-1"),
      loadAgentAwarenessRegistrationRecord: Effect.succeed(null),
      saveAgentAwarenessRegistrationRecord: () => Effect.void,
      clearAgentAwarenessRegistrationRecord: Effect.void,
      loadRecentThreadShortcuts: Effect.succeed([]),
      saveRecentThreadShortcuts: () => Effect.void,
    }),
  ),
);

describe("liveActivityPreferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.effect("restores relay preferences when a machine update fails", () => {
    vi.mocked(linkMachineToCloudWithPreference).mockImplementationOnce(() =>
      Effect.fail(new CloudMachineLinkError({ message: "machine update failed" })),
    );

    return Effect.gen(function* () {
      const exit = yield* Effect.exit(
        setLiveActivityUpdatesEnabled({
          enabled: false,
          previousEnabled: true,
          clerkToken: "clerk-token",
          connections: [connection],
          canConfigureMachine: () => true,
        }),
      );

      expect(exit._tag).toBe("Failure");
      expect(updateAgentAwarenessRegistrationPreferences).toHaveBeenNthCalledWith(1, {
        liveActivitiesEnabled: false,
      });
      expect(updateAgentAwarenessRegistrationPreferences).toHaveBeenNthCalledWith(2, {
        liveActivitiesEnabled: true,
      });
      expect(linkMachineToCloudWithPreference).toHaveBeenNthCalledWith(1, {
        clerkToken: "clerk-token",
        connection,
        liveActivitiesEnabled: false,
      });
      expect(linkMachineToCloudWithPreference).toHaveBeenNthCalledWith(2, {
        clerkToken: "clerk-token",
        connection,
        liveActivitiesEnabled: true,
      });
    }).pipe(Effect.provide(layerTest));
  });

  it.effect("only re-links machines with relay access when enabling updates", () => {
    const readOnlyConnection: SavedRemoteConnection = {
      ...connection,
      machineId: "read-only" as MachineId,
    };

    return Effect.gen(function* () {
      yield* setLiveActivityUpdatesEnabled({
        enabled: true,
        previousEnabled: false,
        clerkToken: "clerk-token",
        connections: [readOnlyConnection, connection],
        canConfigureMachine: (machineId) => machineId === connection.machineId,
      });

      expect(updateAgentAwarenessRegistrationPreferences).toHaveBeenCalledWith({
        liveActivitiesEnabled: true,
      });
      expect(linkMachineToCloudWithPreference).toHaveBeenCalledExactlyOnceWith({
        clerkToken: "clerk-token",
        connection,
        liveActivitiesEnabled: true,
      });
    }).pipe(Effect.provide(layerTest));
  });

  it.effect("checks current relay access after updating the device registration", () => {
    let canConfigureMachine = true;
    vi.mocked(updateAgentAwarenessRegistrationPreferences).mockImplementationOnce(() =>
      Effect.sync(() => {
        canConfigureMachine = false;
      }),
    );

    return Effect.gen(function* () {
      yield* setLiveActivityUpdatesEnabled({
        enabled: false,
        previousEnabled: true,
        clerkToken: "clerk-token",
        connections: [connection],
        canConfigureMachine: () => canConfigureMachine,
      });

      expect(linkMachineToCloudWithPreference).not.toHaveBeenCalled();
      expect(updateAgentAwarenessRegistrationPreferences).toHaveBeenCalledTimes(1);
    }).pipe(Effect.provide(layerTest));
  });
});
