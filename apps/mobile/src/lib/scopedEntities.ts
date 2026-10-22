import { MachineId, ProjectId, RuntimeRequestId, ThreadId } from "@vekrel/contracts";

export function scopedProjectKey(machineId: MachineId, projectId: ProjectId): string {
  return `${machineId}:${projectId}`;
}

export function scopedThreadKey(machineId: MachineId, threadId: ThreadId): string {
  return `${machineId}:${threadId}`;
}

export function scopedRequestKey(
  machineId: MachineId,
  requestId: RuntimeRequestId,
): string {
  return `${machineId}:${requestId}`;
}
