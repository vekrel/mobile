import type { MachineId } from "@vekrel/contracts";
import type { AtomCommandResult } from "@vekrel/client-runtime/state/runtime";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@vekrel/client-runtime/state/runtime";

type RefreshProvidersTarget = {
  readonly machineId: MachineId;
  readonly input: { readonly refreshModels: true };
};

export function createProviderCatalogRefreshRunner<Result>(
  refreshProviders: (target: RefreshProvidersTarget) => Promise<Result>,
) {
  let pending: Promise<Result> | null = null;

  return (machineId: MachineId): Promise<Result> => {
    if (pending) return pending;
    pending = refreshProviders({ machineId, input: { refreshModels: true } }).finally(() => {
      pending = null;
    });
    return pending;
  };
}

export function providerCatalogRefreshError(
  result: AtomCommandResult<unknown, unknown>,
): string | null {
  if (result._tag !== "Failure" || isAtomCommandInterrupted(result)) return null;
  const error = squashAtomCommandFailure(result);
  return error instanceof Error ? error.message : "Provider discovery failed.";
}
