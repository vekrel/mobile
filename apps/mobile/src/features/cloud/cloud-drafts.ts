import { MachineRegistry, removedWithRelay } from "@vekrel/client-runtime/connection";
import { createRuntimeCommand } from "@vekrel/client-runtime/state/runtime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SubscriptionRef from "effect/SubscriptionRef";

import { connectionAtomRuntime } from "../../connection/runtime";
import { archiveCloudComposerDrafts } from "../../state/use-composer-drafts";

export class CloudDraftArchiveError extends Schema.TaggedError<CloudDraftArchiveError>()(
  "CloudDraftArchiveError",
  {
    machineCount: Schema.Number,
    hasAccountId: Schema.Boolean,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Could not preserve local drafts for ${this.machineCount} cloud machines before sign-out.`;
  }
}

export const removeCloudMachines = createRuntimeCommand(connectionAtomRuntime, {
  label: "cloud:preserve-drafts-and-remove-machines",
  execute: Effect.fn("removeCloudMachines")(function* (accountId: string | null) {
    const registry = yield* MachineRegistry.MachineRegistry;
    const entries = yield* SubscriptionRef.get(registry.entries);
    const machineIds = new Set(
      [...entries.values()].filter(removedWithRelay).map((entry) => entry.target.machineId),
    );
    // Credentials are already revoked. A failed backup must leave the local
    // owners intact so a later sign-in can retry without losing their files.
    yield* Effect.tryPromise({
      try: () => archiveCloudComposerDrafts(accountId, machineIds),
      catch: (cause) =>
        new CloudDraftArchiveError({
          machineCount: machineIds.size,
          hasAccountId: accountId !== null,
          cause,
        }),
    });
    yield* registry.removeRelayMachines();
  }),
});
