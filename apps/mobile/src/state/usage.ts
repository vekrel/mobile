import { useAtomValue } from "@effect/atom-react";
import {
  AuthDiagnosticsReadScope,
  USAGE_CONTRACT_VERSION,
  type MachineId,
  type UsageSummary,
  type UsageSummaryInput,
} from "@vekrel/contracts";
import { needsCursorKeychainAccess, refreshUsage } from "@vekrel/client-runtime/state/usage";
import { resolveUsageAccess } from "@vekrel/client-runtime/state/usage-access";
import { mergeUsage, type MachineUsage, type MergedUsage } from "@vekrel/shared/usageMerge";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";
import { useCallback, useMemo } from "react";

import { appAtomRegistry } from "./atom-registry";
import { machinePresentations } from "./presentation";
import { serverMachine } from "./server";
import { machineSession, readMachineScope } from "./session";

export interface MachineUsageStatus {
  readonly machineId: MachineId;
  readonly label: string;
  readonly isPending: boolean;
  readonly isConnected: boolean;
  readonly canReadDiagnostics: boolean;
  readonly error: string | null;
  readonly summary: UsageSummary | null;
  readonly needsCursorKeychainAccess: boolean;
}

/**
 * Keyed by the serialised window so switching ranges does not thrash the atom cache, and so
 * each machine's query is shared with any other reader of the same window.
 */
const usageByWindowAtom = Atom.family((windowKey: string) =>
  Atom.make((get): readonly MachineUsageStatus[] => {
    const input = JSON.parse(windowKey) as UsageSummaryInput;
    const presentations = get(machinePresentations.presentationsAtom);

    const statuses: MachineUsageStatus[] = [];
    for (const [machineId, presentation] of presentations) {
      const sessionResult = get(machineSession.sessionStateAtom(machineId));
      const access = resolveUsageAccess({
        connectionPhase: presentation.connection.phase,
        session: Option.getOrNull(AsyncResult.value(sessionResult)),
        hasSessionError: sessionResult._tag === "Failure",
      });
      if (!access.canReadDiagnostics) {
        statuses.push({
          machineId,
          label: presentation.entry.target.label,
          isConnected: presentation.connection.phase === "connected",
          ...access,
          summary: null,
          needsCursorKeychainAccess: false,
        });
        continue;
      }
      const result = get(serverMachine.usageSummary({ machineId, input }));
      const summary = Option.getOrNull(AsyncResult.value(result));
      statuses.push({
        machineId,
        label: presentation.entry.target.label,
        isPending: result.waiting,
        isConnected: presentation.connection.phase === "connected",
        canReadDiagnostics: true,
        error: result._tag === "Failure" ? "This machine could not report usage." : null,
        summary,
        needsCursorKeychainAccess: needsCursorKeychainAccess(
          summary,
          get(serverMachine.providersValueAtom(machineId)),
        ),
      });
    }
    return statuses;
  }).pipe(Atom.withLabel(`mobile-usage:window:${windowKey}`)),
);

export interface UsageView {
  readonly merged: MergedUsage;
  readonly machines: readonly MachineUsageStatus[];
  readonly selectedMachines: readonly MachineUsageStatus[];

  readonly isPending: boolean;

  readonly isPartial: boolean;
  readonly refresh: (input?: UsageSummaryInput) => Promise<void>;
}

export function useUsage(
  input: UsageSummaryInput,
  selectedMachineIds: ReadonlySet<MachineId> | null = null,
): UsageView {
  const windowKey = useMemo(
    () =>
      JSON.stringify({
        sinceDay: input.sinceDay,
        untilDay: input.untilDay,
        timeZone: input.timeZone,
        resolution: input.resolution,
        sinceTime: input.sinceTime,
        untilTime: input.untilTime,
      }),
    [
      input.sinceDay,
      input.untilDay,
      input.timeZone,
      input.resolution,
      input.sinceTime,
      input.untilTime,
    ],
  );
  const atom = usageByWindowAtom(windowKey);
  const machines = useAtomValue(atom);
  const selectedMachines = useMemo(
    () =>
      selectedMachineIds === null
        ? machines
        : machines.filter(({ machineId }) => selectedMachineIds.has(machineId)),
    [machines, selectedMachineIds],
  );

  const refresh = useCallback(
    (nextInput?: UsageSummaryInput) =>
      refreshUsage({
        registry: appAtomRegistry,
        server: serverMachine,
        presentations: machinePresentations,

        machineIds: selectedMachines
          .filter(
            (machine) =>
              machine.canReadDiagnostics &&
              readMachineScope(machine.machineId, AuthDiagnosticsReadScope),
          )
          .map(({ machineId }) => machineId),
        input: nextInput ?? (JSON.parse(windowKey) as UsageSummaryInput),
      }),
    [selectedMachines, windowKey],
  );

  const merged = useMemo(() => {
    const answered: MachineUsage[] = selectedMachines.flatMap((machine) =>
      machine.summary === null
        ? []
        : [
            {
              machineId: machine.machineId,
              label: machine.label,
              summary: machine.summary,
            },
          ],
    );
    return mergeUsage(answered, USAGE_CONTRACT_VERSION);
  }, [selectedMachines]);

  const answeredCount = selectedMachines.filter(
    (machine) => machine.summary !== null,
  ).length;
  const stillReporting = selectedMachines.filter(
    (machine) => machine.summary === null && machine.error === null,
  ).length;

  return {
    merged,
    machines,
    selectedMachines,
    isPending: answeredCount === 0 && stillReporting > 0,
    isPartial: answeredCount > 0 && stillReporting > 0,
    refresh,
  };
}
