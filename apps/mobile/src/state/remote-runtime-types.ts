import { type MachineConnectionPhase } from "@vekrel/client-runtime/connection";
import { MachineId, ThreadId, type ServerConfig } from "@vekrel/contracts";

export interface MachineRuntimeState {
  readonly connectionState: MachineConnectionPhase;
  readonly connectionError: string | null;
  readonly connectionErrorTraceId: string | null;
  readonly serverConfig: ServerConfig | null;
}

export interface ConnectedMachineSummary {
  readonly machineId: MachineId;
  readonly machineLabel: string;
  readonly displayUrl: string;
  readonly isRelayManaged: boolean;
  readonly isEnabled: boolean;
  readonly connectionState: MachineConnectionPhase;
  readonly connectionError: string | null;
  readonly connectionErrorTraceId: string | null;
}

export interface SelectedThreadRef {
  readonly machineId: MachineId;
  readonly threadId: ThreadId;
}
