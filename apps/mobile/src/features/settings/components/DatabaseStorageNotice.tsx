import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";

import { copyTextWithHaptic } from "../../../lib/copyTextWithHaptic";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../../state/preferences";
import { serverMachine } from "../../../state/server";
import type { SettingsTarget } from "../settings-machine-filter";
import { SettingsActionRow } from "./SettingsActionRow";
import { SettingsSection } from "./SettingsSection";

/** Suggests `vekrel doctor` on every machine whose database still holds at least 1 GiB of freed pages. */
export function DatabaseStorageNotice({
  targets,
}: {
  readonly targets: readonly SettingsTarget[];
}) {
  const recommendations = useAtomValue(
    serverMachine.databaseCompactionRecommendations(
      JSON.stringify(targets.map((target) => target.machineId)),
    ),
  );
  const preferences = useAtomValue(mobilePreferencesAtom);
  const updatePreferences = useAtomSet(updateMobilePreferencesAtom);
  const dismissed = AsyncResult.isSuccess(preferences)
    ? (preferences.value.dismissedDatabaseStorageNotices ?? [])
    : [];
  const visible = recommendations.filter(
    (recommendation) => !dismissed.includes(recommendation.machineId),
  );
  if (visible.length === 0) return null;
  return (
    <SettingsSection
      title="Reclaim database space"
      footer="Old history is cleaned up automatically, but these databases still hold the freed space. Run the command on each machine to return it to disk; it pauses and restarts the background service. Quit the desktop app first if it hosts the machine."
    >
      {visible.map(({ machineId, status }) => (
        <SettingsActionRow
          key={machineId}
          icon="doc.on.doc"
          label={targets.find((target) => target.machineId === machineId)?.label ?? ""}
          description={status.compactCommand}
          detail={`${(status.reclaimableBytes / 1024 ** 3).toFixed(1)} GiB`}
          onPress={() => copyTextWithHaptic(status.compactCommand, { target: "command" })}
        />
      ))}
      <SettingsActionRow
        icon="xmark"
        label="Dismiss"
        onPress={() =>
          updatePreferences({
            transform: (current) => ({
              dismissedDatabaseStorageNotices: [
                ...new Set([
                  ...(current.dismissedDatabaseStorageNotices ?? []),
                  ...visible.map((recommendation) => recommendation.machineId),
                ]),
              ],
            }),
          })
        }
      />
    </SettingsSection>
  );
}
