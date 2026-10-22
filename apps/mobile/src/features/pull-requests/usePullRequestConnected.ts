import { useWorkspaceMachines } from "../../state/workspace";

export function usePullRequestConnected(machineId: string) {
  return useWorkspaceMachines().some(
    (machine) =>
      machine.machineId === machineId && machine.connectionState === "connected",
  );
}
