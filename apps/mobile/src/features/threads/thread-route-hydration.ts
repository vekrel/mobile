import type { MachineConnectionPhase } from "@vekrel/client-runtime/connection";
import type { MachineShellStatus } from "@vekrel/client-runtime/state/shell";
import type { MachineThreadStatus } from "@vekrel/client-runtime/state/threads";

export function threadRouteIsHydrating(input: {
  readonly isLoadingConnections: boolean;
  readonly connectionState: MachineConnectionPhase;
  readonly shellStatus: MachineShellStatus;
  readonly shellHasError: boolean;
  readonly detailStatus: MachineThreadStatus;
  readonly detailHasError: boolean;
}): boolean {
  if (input.detailStatus === "deleted" || input.shellHasError || input.detailHasError) {
    return false;
  }
  if (input.isLoadingConnections) {
    return true;
  }
  if (
    input.connectionState === "available" ||
    input.connectionState === "offline" ||
    input.connectionState === "error"
  ) {
    return false;
  }
  return (
    input.connectionState === "connecting" ||
    input.connectionState === "reconnecting" ||
    input.shellStatus === "synchronizing" ||
    (input.connectionState === "connected" && input.shellStatus === "empty") ||
    input.detailStatus === "synchronizing" ||
    (input.connectionState === "connected" && input.detailStatus === "empty")
  );
}
