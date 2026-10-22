import {
  AuthOrchestrationOperateScope,
  MachineAuthorizationError,
  MachineId,
} from "@vekrel/contracts";
import { runAttachmentUploadCycle } from "@vekrel/client-runtime/state/attachments";
import * as Cause from "effect/Cause";
import { AsyncResult, AtomRegistry } from "effect/reactivity";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  grantedMachines: new Set<string>(),
  create: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("../connection/runtime", () => ({ connectionAtomRuntime: {} }));
vi.mock("./session", () => ({
  readMachineScope: (machineId: string, scope: string) =>
    scope === AuthOrchestrationOperateScope && state.grantedMachines.has(machineId),
}));
vi.mock("@vekrel/client-runtime/state/attachments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vekrel/client-runtime/state/attachments")>()),
  createAttachmentMachineAtoms: () => ({
    createUploadUrl: { label: "create", run: state.create },
    remove: { label: "remove", run: state.remove },
  }),
}));

import { attachmentMachine } from "./attachments";

const machineId = MachineId.make("secondary");
const registry = AtomRegistry.make();
beforeEach(() => {
  state.grantedMachines = new Set(["primary"]);
  state.create.mockReset().mockResolvedValue(
    AsyncResult.success({
      attachmentId: "pending",
      relativeUrl: "/upload",
      expiresAt: 1,
    }),
  );
  state.remove.mockReset().mockResolvedValue(AsyncResult.success(undefined));
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("attachment mutation grants", () => {
  it("uses the attachment machine for both mint and deletion", async () => {
    const mintResult = await attachmentMachine.createUploadUrl.run(registry, {
      machineId,
      input: { name: "image.png", mimeType: "image/png", sizeBytes: 1 },
    });
    const removeResult = await attachmentMachine.remove.run(registry, {
      machineId,
      input: { attachmentId: "pending" },
    });
    for (const result of [mintResult, removeResult]) {
      expect(result._tag).toBe("Failure");
      if (result._tag !== "Failure") throw new Error("Expected permission denial");
      const error = Cause.squash<unknown>(result.cause);
      expect(error).toBeInstanceOf(MachineAuthorizationError);
      expect(error).toMatchObject({ requiredScope: AuthOrchestrationOperateScope });
    }
    expect(state.create).not.toHaveBeenCalled();
    expect(state.remove).not.toHaveBeenCalled();
    state.grantedMachines.add("secondary");
    expect(
      (
        await attachmentMachine.remove.run(registry, {
          machineId,
          input: { attachmentId: "pending" },
        })
      )._tag,
    ).toBe("Success");
    expect(state.remove).toHaveBeenCalledOnce();
  });

  it("blocks the upload cycle's asynchronous cleanup after grant revocation", async () => {
    state.grantedMachines.add("secondary");
    const transport = vi.fn();
    const result = await runAttachmentUploadCycle({
      registry,
      ...attachmentMachine,
      machineId,
      upload: { name: "image.png", mimeType: "image/png", sizeBytes: 1 },
      resolveUploadUrl: () => "https://example.test/upload",
      transport,
      onMinted: () => {
        state.grantedMachines.delete("secondary");
        return "cancel";
      },
    });
    expect(result.status).toBe("cancelled");
    expect(state.create).toHaveBeenCalledOnce();
    expect(state.remove).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });
});
