import type { TerminalSessionState } from "@vekrel/client-runtime/state/terminal";
import {
  AuthTerminalOperateScope,
  type MachineId,
  type TerminalResizeInput,
  type ThreadId,
} from "@vekrel/contracts";
import { useEffect } from "react";

import type { TerminalGridSize } from "./terminalUiState";
import { readMachineScope } from "../../state/session";

export function useTerminalGridSync({
  machineId,
  threadId,
  terminalId,
  canOperate,
  terminal,
  size,
  resize,
}: {
  readonly machineId: MachineId | null;
  readonly threadId: ThreadId | null;
  readonly terminalId: string;
  readonly canOperate: boolean;
  readonly terminal: Pick<TerminalSessionState, "output" | "status" | "version">;
  readonly size: TerminalGridSize;
  readonly resize: (target: {
    readonly machineId: MachineId;
    readonly input: TerminalResizeInput;
  }) => void;
}): void {
  const generation =
    canOperate && terminal.version > 0 && terminal.status === "running"
      ? terminal.output.generation
      : null;

  useEffect(() => {
    if (
      generation === null ||
      machineId === null ||
      threadId === null ||
      !readMachineScope(machineId, AuthTerminalOperateScope)
    )
      return;
    resize({
      machineId,
      input: { threadId, terminalId, cols: size.cols, rows: size.rows },
    });
  }, [machineId, generation, resize, size.cols, size.rows, terminalId, threadId]);
}
