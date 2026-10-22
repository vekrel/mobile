import {
  combineTerminalSessionState,
  EMPTY_TERMINAL_BUFFER_STATE,
  EMPTY_TERMINAL_SESSION_STATE,
  terminalOutputText,
  type KnownTerminalSession,
  type TerminalSessionState,
} from "@vekrel/client-runtime/state/terminal";
import {
  AuthTerminalReadScope,
  AuthTerminalOperateScope,
  ThreadId,
  type MachineId,
  type TerminalAttachInput,
} from "@vekrel/contracts";
import { useMemo } from "react";

import { useMachineQuery } from "./query";
import { terminalMachine } from "./terminal";
import { useMachineScope } from "./session";

type LegacyTerminalSessionState = TerminalSessionState & { readonly buffer: string };
const EMPTY_LEGACY_TERMINAL_SESSION_STATE: LegacyTerminalSessionState = {
  ...EMPTY_TERMINAL_SESSION_STATE,
  buffer: "",
};

export function useAttachedTerminalSession(input: {
  readonly machineId: MachineId | null;
  readonly terminal: TerminalAttachInput | null;
}): LegacyTerminalSessionState {
  const canRead = useMachineScope(input.machineId, AuthTerminalReadScope);
  const canOperate = useMachineScope(input.machineId, AuthTerminalOperateScope);
  const attach = useMachineQuery(
    input.machineId !== null && input.terminal !== null
      ? canOperate
        ? terminalMachine.attach({
            machineId: input.machineId,
            input: input.terminal,
          })
        : canRead
          ? terminalMachine.observe({
              machineId: input.machineId,
              input: { threadId: input.terminal.threadId, terminalId: input.terminal.terminalId },
            })
          : null
      : null,
  );
  const metadata = useMachineQuery(
    input.machineId === null || !canRead
      ? null
      : terminalMachine.metadata({
          machineId: input.machineId,
          input: null,
        }),
  );
  const output = attach.data?.output ?? EMPTY_TERMINAL_BUFFER_STATE.output;
  // Installed native binaries still accept initialBuffer. Keep materialization
  // at this mobile boundary until the native streaming API is released.
  const buffer = useMemo(() => terminalOutputText(output), [output]);

  return useMemo(() => {
    if (input.machineId === null || input.terminal === null) {
      return EMPTY_LEGACY_TERMINAL_SESSION_STATE;
    }
    const summary =
      metadata.data?.find(
        (terminal) =>
          terminal.threadId === input.terminal?.threadId &&
          terminal.terminalId === input.terminal?.terminalId,
      ) ?? null;
    const state = {
      ...combineTerminalSessionState(summary, attach.data ?? EMPTY_TERMINAL_BUFFER_STATE),
      buffer,
    };
    return attach.error === null ? state : { ...state, error: attach.error, status: "error" };
  }, [attach.data, attach.error, buffer, input.machineId, input.terminal, metadata.data]);
}

export function useKnownTerminalSessions(input: {
  readonly machineId: MachineId | null;
  readonly threadId: ThreadId | null;
}) {
  const canRead = useMachineScope(input.machineId, AuthTerminalReadScope);
  const metadata = useMachineQuery(
    input.machineId === null || !canRead
      ? null
      : terminalMachine.metadata({
          machineId: input.machineId,
          input: null,
        }),
  );
  const sessions = useMemo((): ReadonlyArray<KnownTerminalSession> | null => {
    if (input.machineId === null || metadata.data === null || metadata.error !== null) {
      return null;
    }
    return metadata.data
      .filter((summary) => input.threadId === null || summary.threadId === input.threadId)
      .map((summary) => ({
        target: {
          machineId: input.machineId!,
          threadId: ThreadId.make(summary.threadId),
          terminalId: summary.terminalId,
        },
        state: combineTerminalSessionState(summary, EMPTY_TERMINAL_BUFFER_STATE),
      }))
      .sort((left, right) =>
        left.target.terminalId.localeCompare(right.target.terminalId, undefined, {
          numeric: true,
        }),
      );
  }, [input.machineId, input.threadId, metadata.data, metadata.error]);
  return { sessions, isPending: metadata.isPending, error: metadata.error };
}
