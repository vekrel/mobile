import type { MachineProject } from "@vekrel/client-runtime/state/models";

export type PullRequestMachineTarget = {
  readonly machineId: string;
  readonly projectId: string;
  readonly repository: string;
  readonly host?: string;
};

export function pullRequestFallbackMachine(
  target: PullRequestMachineTarget,
  projects: ReadonlyArray<MachineProject>,
  connectedMachineIds: ReadonlySet<string>,
) {
  if (connectedMachineIds.has(target.machineId)) return null;
  const own = projects.find(
    (project) => project.machineId === target.machineId && project.id === target.projectId,
  );
  const host = target.host ?? own?.repositoryIdentity?.canonicalKey.split("/")[0];
  if (!host) return null;
  const key = `${host}/${target.repository}`.toLowerCase();
  const copy = projects.find(
    (project) =>
      project.machineId !== target.machineId &&
      connectedMachineIds.has(project.machineId) &&
      project.repositoryIdentity?.canonicalKey.toLowerCase() === key,
  );
  return copy ? { machineId: String(copy.machineId), projectId: String(copy.id) } : null;
}
