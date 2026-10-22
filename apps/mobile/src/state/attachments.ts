import { createAttachmentMachineAtoms } from "@vekrel/client-runtime/state/attachments";
import type { AtomCommand } from "@vekrel/client-runtime/state/runtime";
import {
  AuthOrchestrationOperateScope,
  MachineAuthorizationError,
  type MachineId,
} from "@vekrel/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";

import { connectionAtomRuntime } from "../connection/runtime";
import { readMachineScope } from "./session";

function requireAttachmentWriteAccess<W extends { readonly machineId: MachineId }, A, E>(
  command: AtomCommand<W, A, E>,
): AtomCommand<W, A, E | MachineAuthorizationError> {
  return {
    ...command,
    run: async (registry, input) => {
      if (!readMachineScope(input.machineId, AuthOrchestrationOperateScope)) {
        return AsyncResult.failure(
          Cause.fail(
            new MachineAuthorizationError({
              message: "This connection cannot change attachments.",
              requiredScope: AuthOrchestrationOperateScope,
            }),
          ),
        );
      }
      return command.run(registry, input);
    },
  };
}

const commands = createAttachmentMachineAtoms(connectionAtomRuntime);
export const attachmentMachine = {
  createUploadUrl: requireAttachmentWriteAccess(commands.createUploadUrl),
  remove: requireAttachmentWriteAccess(commands.remove),
};
