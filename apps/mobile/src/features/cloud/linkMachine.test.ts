import { beforeEach, vi } from "vite-plus/test";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { MachineId } from "@vekrel/contracts";
import { RelayMobileClientId } from "@vekrel/contracts/relay";
import { ManagedRelay } from "@vekrel/client-runtime/relay";
import { layerRemoteHttpClient } from "@vekrel/client-runtime/rpc";
import { HttpClient } from "effect/http";

import * as MobileStorage from "../../persistence/mobile-storage";

import { linkMachineToCloudWithPreference } from "./linkMachine";

vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: {
        relay: {
          url: "https://relay.example.test",
        },
      },
    },
  },
}));

vi.mock("expo-device", () => ({
  deviceType: 1,
  DeviceType: {
    UNKNOWN: 0,
    PHONE: 1,
    TABLET: 2,
    DESKTOP: 3,
    TV: 4,
  },
  osVersion: "18.4.1",
  modelName: "iPhone 15 Pro",
}));

vi.mock("react-native", () => ({
  Platform: {
    OS: "ios",
  },
}));

vi.mock("expo-secure-store", () => ({
  deleteItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));

const savedConnection = {
  machineId: MachineId.make("env-1"),
  machineLabel: "Desktop",
  pairingUrl: "https://desktop.example.test/",
  displayUrl: "https://desktop.example.test/",
  httpBaseUrl: "https://desktop.example.test/",
  wsBaseUrl: "wss://desktop.example.test/ws",
  bearerToken: "local-bearer",
};

const createProofMock = vi.fn(
  (input: { readonly method: string; readonly url: string; readonly accessToken?: string }) =>
    Effect.succeed(`dpop:${input.method}:${input.url}`),
);
const layerTestDpopSigner = Layer.succeed(
  ManagedRelay.ManagedRelayDpopSigner,
  ManagedRelay.ManagedRelayDpopSigner.of({
    thumbprint: Effect.succeed("client-proof-key-thumbprint"),
    createProof: (input) => createProofMock(input),
  }),
);

function layerCloudClient() {
  const layerHttpClient = layerRemoteHttpClient((input, init) => globalThis.fetch(input, init));
  return Layer.mergeAll(
    layerHttpClient,
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
    ManagedRelay.layer({
      relayUrl: "https://relay.example.test",
      clientId: RelayMobileClientId,
    }).pipe(Layer.provideMerge(layerTestDpopSigner), Layer.provide(layerHttpClient)),
  );
}

const withCloudServices = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    | HttpClient.HttpClient
    | ManagedRelay.ManagedRelayClient
    | ManagedRelay.ManagedRelayDpopSigner
    | MobileStorage.MobileStorage
  >,
) => effect.pipe(Effect.provide(layerCloudClient()));

function validLinkProof() {
  return "signed-machine-link-jwt";
}

function validLinkResponse(machineId = "env-1") {
  return {
    ok: true,
    machineId,
    endpoint: {
      httpBaseUrl: "https://managed.example.test/",
      wsBaseUrl: "wss://managed.example.test/ws",
      providerKind: "cloudflare_tunnel",
    },
    endpointRuntime: {
      providerKind: "cloudflare_tunnel",
      connectorToken: "connector-token",
    },
    relayIssuer: "https://relay.example.test",
    cloudUserId: "user_123",
    machineCredential: "machine-credential",
    cloudMintPublicKey: "cloud-mint-public-key",
  };
}

function validLinkChallengeResponse() {
  return {
    challenge: "link-challenge",
    expiresAt: "2026-05-25T00:05:00.000Z",
  };
}

function requestBodyText(body: BodyInit | null | undefined): string {
  return body instanceof Uint8Array ? new TextDecoder().decode(body) : String(body ?? "");
}

describe("mobile cloud link machine client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    createProofMock.mockClear();
  });

  it.effect(
    "rejects relay link credentials for a different machine before persisting relay config",
    () =>
      Effect.gen(function* () {
        const fetchMock = vi.fn((url: string | URL) => {
          if (String(url).endsWith("/v1/client/machine-link-challenges")) {
            return Promise.resolve(Response.json(validLinkChallengeResponse()));
          }
          if (String(url).endsWith("/api/connect/link-proof")) {
            return Promise.resolve(Response.json(validLinkProof()));
          }
          return Promise.resolve(Response.json(validLinkResponse("env-other")));
        });
        vi.stubGlobal("fetch", fetchMock);

        const error = yield* withCloudServices(
          linkMachineToCloudWithPreference({
            accountToken: "account-token",
            connection: savedConnection,
            liveActivitiesEnabled: true,
          }),
        ).pipe(Effect.flip);
        expect(error).toMatchObject({
          _tag: "CloudMachineLinkError",
          message: "Relay returned credentials for a different machine.",
        });
        expect(fetchMock).toHaveBeenCalledTimes(3);
      }),
  );

  it.effect("rejects relay link credentials for a different managed endpoint provider", () =>
    Effect.gen(function* () {
      const fetchMock = vi.fn((url: string | URL) => {
        if (String(url).endsWith("/v1/client/machine-link-challenges")) {
          return Promise.resolve(Response.json(validLinkChallengeResponse()));
        }
        if (String(url).endsWith("/api/connect/link-proof")) {
          return Promise.resolve(Response.json(validLinkProof()));
        }
        return Promise.resolve(
          Response.json({
            ...validLinkResponse(),
            endpoint: {
              ...validLinkResponse().endpoint,
              providerKind: "manual",
            },
          }),
        );
      });
      vi.stubGlobal("fetch", fetchMock);

      const error = yield* withCloudServices(
        linkMachineToCloudWithPreference({
          accountToken: "account-token",
          connection: savedConnection,
          liveActivitiesEnabled: true,
        }),
      ).pipe(Effect.flip);
      expect(error).toMatchObject({
        _tag: "CloudMachineLinkError",
        message: "Relay returned credentials for a different endpoint provider.",
      });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    }),
  );

  it.effect("preserves disabled Live Activity preferences when linking a machine", () =>
    Effect.gen(function* () {
      const bodies: Array<unknown> = [];
      const fetchMock = vi.fn((url: string | URL, init?: RequestInit) => {
        if (init?.body) {
          bodies.push(JSON.parse(requestBodyText(init.body)));
        }
        if (String(url).endsWith("/v1/client/machine-link-challenges")) {
          return Promise.resolve(Response.json(validLinkChallengeResponse()));
        }
        if (String(url).endsWith("/api/connect/link-proof")) {
          return Promise.resolve(Response.json(validLinkProof()));
        }
        if (String(url).endsWith("/v1/client/machine-links")) {
          return Promise.resolve(Response.json(validLinkResponse()));
        }
        return Promise.resolve(
          Response.json({ ok: true, endpointRuntimeStatus: { status: "configured" } }),
        );
      });
      vi.stubGlobal("fetch", fetchMock);

      yield* withCloudServices(
        linkMachineToCloudWithPreference({
          accountToken: "account-token",
          connection: savedConnection,
          liveActivitiesEnabled: false,
        }),
      );

      expect(bodies[1]).toMatchObject({
        endpoint: {
          httpBaseUrl: "https://desktop.example.test/",
          wsBaseUrl: "wss://desktop.example.test/ws",
          providerKind: "cloudflare_tunnel",
        },
        origin: {
          localHttpHost: "127.0.0.1",
          localHttpPort: 443,
        },
      });
      expect(bodies[2]).toMatchObject({
        deviceId: "device-1",
        notificationsEnabled: true,
        liveActivitiesEnabled: false,
        managedTunnelsEnabled: true,
      });
      expect(bodies[3]).toMatchObject({
        cloudUserId: "user_123",
        machineCredential: "machine-credential",
      });
    }),
  );
});
