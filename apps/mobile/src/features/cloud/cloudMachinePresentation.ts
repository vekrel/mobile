import type { RelayMachineStatusResponse } from "@vekrel/contracts/relay";
import {
  orchestrationProtocolCompatibilityError,
  type MachineConnectionPhase,
} from "@vekrel/client-runtime/connection";
import { relayOfflineReasonMessage } from "@vekrel/client-runtime/relay";

export interface AvailableCloudMachinePresentation {
  readonly connectionError: string | null;
  readonly connectionErrorTraceId: string | null;
  readonly connectionState: MachineConnectionPhase;
  readonly statusText: string;
}

export function availableCloudMachinePresentation(input: {
  readonly isStatusPending: boolean;
  readonly status: RelayMachineStatusResponse | null;
  readonly statusError: string | null;
  readonly statusErrorTraceId: string | null;
}): AvailableCloudMachinePresentation {
  const compatibilityError =
    input.status?.descriptor === undefined
      ? null
      : orchestrationProtocolCompatibilityError(input.status.descriptor);
  if (compatibilityError !== null) {
    return {
      connectionError: compatibilityError.message,
      connectionErrorTraceId: null,
      connectionState: "unsupported",
      statusText: compatibilityError.message,
    };
  }
  if (input.status?.status === "online") {
    return {
      connectionError: null,
      connectionErrorTraceId: null,
      connectionState: "available",
      statusText: "Available · Relay online",
    };
  }

  if (input.status?.status === "offline") {
    const connectionError =
      relayOfflineReasonMessage(input.status) ?? input.status.error ?? "Relay is offline.";
    return {
      connectionError,
      connectionErrorTraceId: input.status.traceId ?? null,
      connectionState: "error",
      statusText: connectionError,
    };
  }

  if (input.statusError) {
    return {
      connectionError: input.statusError,
      connectionErrorTraceId: input.statusErrorTraceId,
      connectionState: "error",
      statusText: input.statusError,
    };
  }

  return {
    connectionError: null,
    connectionErrorTraceId: null,
    connectionState: "available",
    statusText: input.isStatusPending
      ? "Available · Checking relay status..."
      : "Available · Relay status unknown",
  };
}
