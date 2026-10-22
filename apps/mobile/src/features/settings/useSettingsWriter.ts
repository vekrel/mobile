import type { MachineId, ServerSettingsPatch } from "@vekrel/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@vekrel/client-runtime/state/runtime";

import * as Dialog from "../../components/ui/Dialog";
import { serverMachine } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import type { ScopedMobileSettingsTarget } from "./settings-scoped-server";

export function useSettingsWriter() {
  const updateSettings = useAtomCommand(serverMachine.updateSettings, {
    label: "machine settings update",
    reportFailure: true,
  });

  return async (
    targets: readonly ScopedMobileSettingsTarget[],
    writes: readonly {
      readonly machineId: MachineId;
      readonly patch: ServerSettingsPatch;
    }[],
  ) => {
    const outcomes = await Promise.all(
      writes.map(async (entry) => {
        const result = await updateSettings({
          machineId: entry.machineId,
          input: { patch: entry.patch },
        });
        if (result._tag !== "Failure" || isAtomCommandInterrupted(result)) return null;
        const label =
          targets.find((target) => target.machine.machineId === entry.machineId)
            ?.machine.label ?? entry.machineId;
        const error = squashAtomCommandFailure(result);
        return `${label}: ${error instanceof Error ? error.message : String(error)}`;
      }),
    );
    const failures = outcomes.filter((outcome) => outcome !== null);
    if (failures.length > 0) {
      Dialog.alert("Could not save settings", failures.join("\n\n"));
    }
  };
}
