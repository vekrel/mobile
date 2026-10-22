import { useNavigation } from "@react-navigation/native";
import { useEffect, useMemo } from "react";

import { useProjects } from "../../state/entities";
import { useWorkspaceMachines } from "../../state/workspace";
import {
  pullRequestFallbackMachine,
  type PullRequestMachineTarget,
} from "./pullRequestMachineFallback";

export function usePullRequestMachineFallback(params: PullRequestMachineTarget) {
  const navigation = useNavigation();
  const projects = useProjects();
  const connected = useWorkspaceMachines()
    .filter((machine) => machine.connectionState === "connected")
    .map((machine) => String(machine.machineId))
    .join("\n");
  const fallback = useMemo(
    () => pullRequestFallbackMachine(params, projects, new Set(connected.split("\n"))),
    [params, projects, connected],
  );
  useEffect(() => {
    if (fallback) navigation.setParams(fallback);
  }, [fallback, navigation]);
}
