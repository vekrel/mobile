import type { MachineId, ThreadId } from "@vekrel/contracts";

interface ThreadActivityFileContext {
  readonly machineId: MachineId;
  readonly currentThreadId: ThreadId;
  readonly activitySourceThreadId: ThreadId;
  readonly relativePath: string;
  readonly line?: number | null;
}

export function buildThreadActivityFileParams(input: ThreadActivityFileContext) {
  return {
    machineId: String(input.machineId),
    threadId: String(input.currentThreadId),
    path: input.relativePath.split("/").filter((segment) => segment.length > 0),
    ...(Number.isFinite(input.line) && Number(input.line) > 0
      ? { line: String(Math.floor(Number(input.line))) }
      : {}),
  };
}
