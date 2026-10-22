import { ConnectionOnboarding } from "@vekrel/client-runtime/connection";
import {
  createAtomCommandScheduler,
  createRuntimeCommand,
} from "@vekrel/client-runtime/state/runtime";
import type { MachineId } from "@vekrel/contracts";
import * as Effect from "effect/Effect";

import { connectionAtomRuntime } from "./runtime";

const onboardingScheduler = createAtomCommandScheduler();

export const connectPairingUrl = createRuntimeCommand(connectionAtomRuntime, {
  label: "mobile:connection:connect-pairing-url",
  scheduler: onboardingScheduler,
  concurrency: {
    mode: "singleFlight",
    // Adding a route to a different machine with the same link is its own
    // operation: it must check its own expected machine.
    key: (input: { readonly pairingUrl: string; readonly expectedMachineId?: MachineId }) =>
      JSON.stringify([input.pairingUrl, input.expectedMachineId ?? null]),
  },
  execute: (input: {
    readonly pairingUrl: string;
    readonly expectedMachineId?: MachineId;
  }) =>
    ConnectionOnboarding.ConnectionOnboarding.pipe(
      Effect.flatMap((onboarding) => onboarding.registerPairing(input)),
    ),
});

export const updateBearerConnection = createRuntimeCommand(connectionAtomRuntime, {
  label: "mobile:connection:update-bearer",
  scheduler: onboardingScheduler,
  concurrency: {
    mode: "serial",
    key: (input: { readonly machineId: MachineId }) => input.machineId,
  },
  execute: (input: {
    readonly machineId: MachineId;
    readonly label: string;
    readonly httpBaseUrl: string;
  }) =>
    ConnectionOnboarding.ConnectionOnboarding.pipe(
      Effect.flatMap((onboarding) => onboarding.updateBearer(input)),
    ),
});
