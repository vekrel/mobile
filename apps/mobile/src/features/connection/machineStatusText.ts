import {
  connectionStatusText,
  type MachineConnectionPresentation,
} from "@vekrel/client-runtime/connection";

export function machineStatusText(connection: MachineConnectionPresentation): string {
  return connection.phase === "unsupported" && connection.error !== null
    ? connection.error
    : connectionStatusText(connection);
}
