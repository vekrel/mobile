import { useAtomValue } from "@effect/atom-react";
import {
  connectionCatalogDisplayUrl,
  hasRelayRoute,
  type MachinePresentation as BaseMachinePresentation,
} from "@vekrel/client-runtime/connection";
import type { MachineId } from "@vekrel/contracts";
import { useMemo } from "react";

import { machineCatalog } from "../connection/catalog";
import { machinePresentations } from "./presentation";
import { useMachineQuery } from "./query";

export interface MachinePresentation extends BaseMachinePresentation {
  readonly machineId: MachineId;
  readonly label: string;
  readonly displayUrl: string | null;
  readonly relayManaged: boolean;
}

export function projectMachinePresentation(
  machineId: MachineId,
  presentation: BaseMachinePresentation,
): MachinePresentation {
  return {
    ...presentation,
    machineId,
    label: presentation.entry.target.label,
    displayUrl: connectionCatalogDisplayUrl(presentation.entry),
    relayManaged: hasRelayRoute(presentation.entry),
  };
}

export function useMachines() {
  const catalog = useAtomValue(machineCatalog.catalogValueAtom);
  const networkStatus = useAtomValue(machineCatalog.networkStatusValueAtom);
  const presentationById = useAtomValue(machinePresentations.presentationsAtom);

  const machines = useMemo(
    () =>
      [...presentationById.entries()].map(([machineId, presentation]) =>
        projectMachinePresentation(machineId, presentation),
      ),
    [presentationById],
  );

  return {
    isReady: catalog.isReady,
    networkStatus,
    machines,
    presentationById,
  };
}

export function useMachineConnectionState(machineId: MachineId) {
  return useMachineQuery(machineCatalog.stateAtom(machineId));
}
