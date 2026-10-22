import * as Dialog from "../../components/ui/Dialog";
import { useAtomValue } from "@effect/atom-react";
import { sessionHasLegacyPermissions } from "@vekrel/contracts";
import { Atom } from "effect/reactivity";
import * as SecureStore from "expo-secure-store";
import { useEffect, useMemo, useRef, useState } from "react";

import { whenProtectedDataAvailable } from "../../lib/protectedData";
import { useMachines } from "../../state/machines";
import { machineSession } from "../../state/session";

const storageKey = "vekrel.permission-update.v1";
const dismissedThisLaunch = new Set<string>();
const shownThisLaunch = new Set<string>();

export function PermissionUpdateNotice() {
  const { machines } = useMachines();
  const [dismissed, setDismissed] = useState<ReadonlySet<string> | null>(null);
  const showing = useRef(false);
  const affected = useAtomValue(
    useMemo(
      () =>
        Atom.make((get) =>
          machines.filter(({ machineId }) => {
            const session = get(machineSession.sessionStateAtom(machineId));
            return (
              session._tag === "Success" &&
              !session.waiting &&
              sessionHasLegacyPermissions(session.value)
            );
          }),
        ),
      [machines],
    ),
  );

  useEffect(() => {
    let active = true;
    void whenProtectedDataAvailable()
      .then(() => SecureStore.getItemAsync(storageKey))
      .then((raw) => {
        const value: unknown = raw === null ? [] : JSON.parse(raw);
        if (active)
          setDismissed(
            new Set(
              Array.isArray(value)
                ? value.filter((id): id is string => typeof id === "string")
                : [],
            ),
          );
      })
      .catch(() => {
        if (active) setDismissed(new Set());
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (dismissed === null || showing.current) return;
    const machine = affected.find(
      ({ machineId }) => !dismissed.has(machineId) && !shownThisLaunch.has(machineId),
    );
    if (!machine) return;
    showing.current = true;
    shownThisLaunch.add(machine.machineId);
    const dismiss = () => {
      dismissedThisLaunch.add(machine.machineId);
      const next = new Set([...dismissed, ...dismissedThisLaunch]);
      showing.current = false;
      setDismissed(next);
      void SecureStore.setItemAsync(storageKey, JSON.stringify([...next])).catch(() => {});
    };
    Dialog.alert(
      `Permissions have changed for ${machine.label}`,
      "This connection still uses the old permissions, so some actions may no longer be available. Pair again using a new link with the permissions you need.",
      [{ text: "Got it", onPress: dismiss }],
      { cancelable: false },
    );
  }, [affected, dismissed]);
  return null;
}
