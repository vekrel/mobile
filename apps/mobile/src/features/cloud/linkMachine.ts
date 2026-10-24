import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpClient } from "effect/http";
import {
  MachineCloudEndpointUnavailableError,
  MachineHttpBadRequestError,
  MachineHttpConflictError,
  MachineHttpForbiddenError,
  MachineHttpInternalServerError,
  MachineHttpUnauthorizedError,
} from "@vekrel/contracts";
import {
  type RelayMachineLinkResponse as RelayMachineLinkResponseType,
  type RelayManagedEndpointProviderKind,
} from "@vekrel/contracts/relay";
import { findErrorTraceId } from "@vekrel/client-runtime/errors";
import { ManagedRelay, relayRequestFailureDetail } from "@vekrel/client-runtime/relay";
import { makeMachineHttpApiClient } from "@vekrel/client-runtime/rpc";

import type { SavedRemoteConnection } from "../../lib/connection";
import * as MobileStorage from "../../persistence/mobile-storage";
import { resolveCloudPublicConfig } from "./publicConfig";

function readRelayUrl(): string | null {
  return resolveCloudPublicConfig().relay.url;
}

export class CloudMachineLinkError extends Data.TaggedError("CloudMachineLinkError")<{
  readonly message: string;
  readonly cause?: unknown;
  readonly traceId?: string;
}> {}

const isMachineCloudApiError = Schema.is(
  Schema.Union([
    MachineHttpBadRequestError,
    MachineHttpUnauthorizedError,
    MachineHttpForbiddenError,
    MachineHttpConflictError,
    MachineHttpInternalServerError,
    MachineCloudEndpointUnavailableError,
  ]),
);

const MANAGED_ENDPOINT_PROVIDER_KIND =
  "cloudflare_tunnel" satisfies RelayManagedEndpointProviderKind;

function cloudMachineLinkError(message: string) {
  return (cause: unknown) => {
    const machineError = findMachineCloudApiError(cause);
    const traceId = findErrorTraceId(cause);
    const detail = machineError
      ? `${message.replace(/[.:]$/, "")}: ${machineError.message}`
      : withDevCause(message, cause);
    return new CloudMachineLinkError({
      message: detail,
      cause,
      ...(traceId === null ? {} : { traceId }),
    });
  };
}

function isDevRuntime(): boolean {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

function causeMessage(cause: unknown): string | null {
  if (cause instanceof Error && cause.message) {
    return cause.message;
  }
  if (typeof cause === "object" && cause !== null) {
    const record = cause as { readonly message?: unknown; readonly cause?: unknown };
    if (typeof record.message === "string" && record.message.length > 0) {
      const nested = causeMessage(record.cause);
      return nested ? `${record.message}: ${nested}` : record.message;
    }
  }
  return null;
}

function withDevCause(message: string, cause: unknown): string {
  if (!isDevRuntime()) {
    return message;
  }
  const detail = causeMessage(cause);
  return detail ? `${message} (${detail})` : message;
}

function decodedRelayClientError(message: string) {
  return (cause: ManagedRelay.ManagedRelayClientError) => {
    const failed = cause._tag === "ManagedRelayRequestFailedError" ? cause : undefined;
    const traceId = failed?.traceId;
    const detail = failed ? relayRequestFailureDetail(failed) : null;
    return new CloudMachineLinkError({
      message: detail ? `${message}: ${detail}` : message,
      cause,
      ...(traceId ? { traceId } : {}),
    });
  };
}

function findMachineCloudApiError(cause: unknown): { readonly message: string } | null {
  if (isMachineCloudApiError(cause)) {
    return cause;
  }
  if (typeof cause !== "object" || cause === null) {
    return null;
  }
  return "cause" in cause ? findMachineCloudApiError(cause.cause) : null;
}

function requireRelayUrl(): Effect.Effect<string, CloudMachineLinkError> {
  const relayUrl = readRelayUrl();
  return relayUrl
    ? Effect.succeed(relayUrl)
    : Effect.fail(new CloudMachineLinkError({ message: "Relay URL is not configured." }));
}

function endpointOrigin(httpBaseUrl: string) {
  const url = new URL(httpBaseUrl);
  return {
    localHttpHost: "127.0.0.1",
    localHttpPort: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
  };
}

function ensureLinkedMachineMatches(input: {
  readonly expectedMachineId: string;
  readonly expectedProviderKind: RelayManagedEndpointProviderKind;
  readonly link: RelayMachineLinkResponseType;
}): Effect.Effect<void, CloudMachineLinkError> {
  if (input.link.machineId !== input.expectedMachineId) {
    return new CloudMachineLinkError({
      message: "Relay returned credentials for a different machine.",
    });
  }
  if (input.link.endpoint.providerKind !== input.expectedProviderKind) {
    return new CloudMachineLinkError({
      message: "Relay returned credentials for a different endpoint provider.",
    });
  }
  return Effect.void;
}

interface LinkMachineToCloudInput {
  readonly connection: SavedRemoteConnection;
  readonly accountToken: string;
}

type LinkMachineToCloudRequirements =
  | HttpClient.HttpClient
  | ManagedRelay.ManagedRelayClient
  | MobileStorage.MobileStorage;

export const linkMachineToCloudWithPreference = Effect.fn(
  "linkMachine.linkMachineToCloudWithPreference",
)(function* (
  input: LinkMachineToCloudInput & { readonly liveActivitiesEnabled: boolean },
): Effect.fn.Return<void, CloudMachineLinkError, LinkMachineToCloudRequirements> {
  if (!input.connection.bearerToken) {
    return yield* new CloudMachineLinkError({
      message: "Only a locally paired bearer connection can be linked to the cloud.",
    });
  }
  const localBearerToken = input.connection.bearerToken;
  const relayUrl = yield* requireRelayUrl();
  const relayClient = yield* ManagedRelay.ManagedRelayClient;
  const storage = yield* MobileStorage.MobileStorage;
  const deviceId = yield* storage.loadOrCreateAgentAwarenessDeviceId.pipe(
    Effect.mapError(cloudMachineLinkError("Could not load the mobile device id.")),
  );
  const liveActivitiesEnabled = input.liveActivitiesEnabled;
  const challenge = yield* relayClient
    .createMachineLinkChallenge({
      accountToken: input.accountToken,
      payload: {
        notificationsEnabled: true,
        liveActivitiesEnabled,
        managedTunnelsEnabled: true,
      },
    })
    .pipe(
      Effect.mapError(
        decodedRelayClientError(`${relayUrl}/v1/client/machine-link-challenges failed`),
      ),
    );
  const machineClient = yield* makeMachineHttpApiClient(input.connection.httpBaseUrl);
  const proof = yield* machineClient.connect
    .linkProof({
      headers: { authorization: `Bearer ${localBearerToken}` },
      payload: {
        challenge: challenge.challenge,
        relayIssuer: relayUrl,
        endpoint: {
          httpBaseUrl: input.connection.httpBaseUrl,
          wsBaseUrl: input.connection.wsBaseUrl,
          providerKind: MANAGED_ENDPOINT_PROVIDER_KIND,
        },
        origin: endpointOrigin(input.connection.httpBaseUrl),
      },
    })
    .pipe(Effect.mapError(cloudMachineLinkError("Could not obtain machine link proof.")));
  const link = yield* relayClient
    .linkMachine({
      accountToken: input.accountToken,
      payload: {
        deviceId,
        proof,
        notificationsEnabled: true,
        liveActivitiesEnabled,
        managedTunnelsEnabled: true,
      },
    })
    .pipe(Effect.mapError(decodedRelayClientError(`${relayUrl}/v1/client/machine-links failed`)));
  yield* ensureLinkedMachineMatches({
    expectedMachineId: input.connection.machineId,
    expectedProviderKind: MANAGED_ENDPOINT_PROVIDER_KIND,
    link,
  });

  yield* machineClient.connect
    .relayConfig({
      headers: { authorization: `Bearer ${localBearerToken}` },
      payload: {
        relayUrl,
        relayIssuer: link.relayIssuer,
        cloudUserId: link.cloudUserId,
        machineCredential: link.machineCredential,
        cloudMintPublicKey: link.cloudMintPublicKey,
        endpointRuntime: link.endpointRuntime,
      },
    })
    .pipe(Effect.mapError(cloudMachineLinkError("Could not configure machine relay access.")));
});
