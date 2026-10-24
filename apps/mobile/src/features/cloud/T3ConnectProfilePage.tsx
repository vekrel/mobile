import { findErrorTraceId } from "@vekrel/client-runtime/errors";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@vekrel/client-runtime/state/runtime";
import type { MenuAction } from "@react-native-menu/menu";
import type { MachineId } from "@vekrel/contracts";
import type { RelayClientMachineRecord } from "@vekrel/contracts/relay";
import { type ReactNode, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { AppActivityIndicator } from "../../components/ui/AppActivityIndicator";
import { SymbolView } from "../../components/ui/AppSymbol";
import * as Dialog from "../../components/ui/Dialog";
import { Menu } from "../../components/ui/Menu";
import { copyTextWithHaptic } from "../../lib/copyTextWithHaptic";
import { useAtomCommand } from "../../state/use-atom-command";
import { useCloudAuth } from "./CloudAuthProvider";
import { deregisterManagedRelayMachineCommand, useManagedRelayMachines } from "./managedRelayState";

const linkedAtFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function linkedAtLabel(value: string): string {
  const linkedAt = new Date(value);
  return Number.isNaN(linkedAt.getTime())
    ? "Link date unavailable"
    : `Linked ${linkedAtFormatter.format(linkedAt)}`;
}

function endpointLabel(machine: RelayClientMachineRecord): string {
  return machine.endpoint.providerKind === "cloudflare_tunnel"
    ? "Managed tunnel"
    : "Activity publishing only";
}

function confirmDeregister(machine: RelayClientMachineRecord, onConfirm: () => void) {
  const title = "Deregister server?";
  const message = `“${machine.label}” will be removed from this account. Vekrel Connect access will be revoked, any managed tunnel will be removed, and a host space will become available. Local connections on your devices are not changed.`;
  Dialog.confirm({ title, message, confirmText: "Deregister", destructive: true, onConfirm });
}

function reportAuthFailure(title: string, cause: unknown) {
  const message = cause instanceof Error ? cause.message : "Please try again.";
  console.error(`[vekrel-connect] ${title}`, { message, cause });
  Dialog.alert(title, message);
}

/** Signed out: the relay sign-in page opens in the system browser. */
export function T3ConnectSignInPage() {
  const { signIn } = useCloudAuth();
  const [pending, setPending] = useState(false);

  const handleSignIn = () => {
    if (pending) return;
    setPending(true);
    void signIn()
      .catch((cause: unknown) => reportAuthFailure("Could not sign in", cause))
      .then(() => setPending(false));
  };

  return (
    <ScrollView className="flex-1 bg-account-page" contentInsetAdjustmentBehavior="automatic">
      <AccountSectionHeader>Vekrel Connect</AccountSectionHeader>
      <AccountRow
        title="Sign in to Vekrel"
        subtitle="Reach your machines from anywhere and get notified when a turn ends."
        accessory={
          pending ? (
            <AppActivityIndicator colorClassName={"accent-account-foreground-muted"} size="small" />
          ) : undefined
        }
      />
      <AccountButtonRow label="Continue in browser" onPress={handleSignIn} />
    </ScrollView>
  );
}

export function T3ConnectProfilePage() {
  const { email, signOut } = useCloudAuth();
  const [signingOut, setSigningOut] = useState(false);
  const handleSignOut = () => {
    if (signingOut) return;
    setSigningOut(true);
    void signOut()
      .catch((cause: unknown) => reportAuthFailure("Could not sign out", cause))
      .then(() => setSigningOut(false));
  };
  const machinesState = useManagedRelayMachines();
  const deregisterMachine = useAtomCommand(deregisterManagedRelayMachineCommand, {
    reportFailure: false,
  });
  const [deregisteringMachineId, setDeregisteringMachineId] = useState<MachineId | null>(null);
  const mutationPendingRef = useRef(false);
  // Deregistered rows stay in the cached list until the refresh lands, so hide
  // them by the linkedAt they had. A re-link produces a new linkedAt and shows again.
  const [removedMachines, setRemovedMachines] = useState<{
    readonly accountId: string | null;
    readonly linkedAtById: ReadonlyMap<MachineId, string>;
  }>({ accountId: null, linkedAtById: new Map() });

  const handleDeregister = async (machine: RelayClientMachineRecord) => {
    const accountId = machinesState.accountId;
    if (!accountId || mutationPendingRef.current) return;

    mutationPendingRef.current = true;
    setDeregisteringMachineId(machine.machineId);
    const result = await deregisterMachine({
      accountId,
      machineId: machine.machineId,
    });
    mutationPendingRef.current = false;
    setDeregisteringMachineId(null);

    if (result._tag === "Success") {
      setRemovedMachines((current) => {
        const linkedAtById = new Map(current.accountId === accountId ? current.linkedAtById : []);
        linkedAtById.set(machine.machineId, machine.linkedAt);
        return { accountId, linkedAtById };
      });
      machinesState.refresh();
      return;
    }
    if (isAtomCommandInterrupted(result)) return;

    const cause = squashAtomCommandFailure(result);
    const message = cause instanceof Error ? cause.message : "Could not deregister the server.";
    const traceId = findErrorTraceId(cause);
    console.error("[t3-connect] Could not deregister machine", {
      machineId: machine.machineId,
      message,
      traceId,
      cause,
    });
    Dialog.alert(
      "Could not deregister server",
      traceId ? `${message}\n\nTrace ID: ${traceId}` : message,
      traceId
        ? [
            {
              text: "Copy trace ID",
              onPress: () => copyTextWithHaptic(traceId, { target: "connection-trace-id" }),
            },
            { text: "OK", style: "cancel" },
          ]
        : undefined,
    );
  };

  const removedMachineLinkedAt =
    removedMachines.accountId === machinesState.accountId
      ? removedMachines.linkedAtById
      : new Map<MachineId, string>();
  const machines = (machinesState.data ?? []).filter(
    (machine) => removedMachineLinkedAt.get(machine.machineId) !== machine.linkedAt,
  );
  const isInitialLoad =
    !machinesState.accountId || (machinesState.data === null && !machinesState.error);
  const errorTraceId = machinesState.errorTraceId;

  return (
    <ScrollView
      className="flex-1 bg-account-page"
      contentContainerClassName="pb-8"
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl
          refreshing={machinesState.isPending && machinesState.data !== null}
          onRefresh={machinesState.refresh}
        />
      }
    >
      <AccountSectionHeader>Account</AccountSectionHeader>
      <AccountRow title={email ?? "Signed in"} subtitle="Vekrel account" />
      <AccountButtonRow label={signingOut ? "Signing out" : "Sign out"} onPress={handleSignOut} />

      <AccountSectionHeader>Registered servers</AccountSectionHeader>

      {machinesState.error ? (
        <>
          <AccountRow
            title="Could not load Vekrel Connect machines"
            subtitle={machinesState.error}
          />
          {errorTraceId ? (
            <AccountButtonRow
              label="Copy trace ID"
              onPress={() => {
                copyTextWithHaptic(errorTraceId, { target: "connection-trace-id" });
              }}
            />
          ) : null}
        </>
      ) : isInitialLoad ? (
        <View className="flex-row items-center gap-3 px-6 py-4">
          <AppActivityIndicator colorClassName={"accent-account-foreground-muted"} size="small" />
          <Text className="text-base text-account-foreground-muted">Loading machines</Text>
        </View>
      ) : machines.length > 0 ? (
        machines.map((machine) => (
          <AccountRow
            key={machine.machineId}
            title={machine.label}
            subtitle={`${linkedAtLabel(machine.linkedAt)} · ${endpointLabel(machine)}`}
            accessory={
              deregisteringMachineId === machine.machineId ? (
                <AppActivityIndicator
                  colorClassName={"accent-account-foreground-muted"}
                  size="small"
                />
              ) : (
                <Menu
                  actions={MACHINE_MENU_ACTIONS}
                  isAnchoredToRight
                  onPressAction={() =>
                    confirmDeregister(machine, () => void handleDeregister(machine))
                  }
                >
                  <Pressable
                    accessibilityLabel={`Actions for ${machine.label}`}
                    accessibilityRole="button"
                    disabled={deregisteringMachineId !== null}
                    className="size-[30px] items-center justify-center active:opacity-60 disabled:opacity-50"
                  >
                    <View className="rotate-90">
                      <SymbolView
                        name="ellipsis"
                        size={18}
                        tintColorClassName={"accent-account-foreground-muted"}
                        type="monochrome"
                      />
                    </View>
                  </Pressable>
                </Menu>
              )
            }
          />
        ))
      ) : (
        <AccountRow
          title="No servers registered"
          subtitle="Link a server from its local Settings to reach it through Vekrel Connect."
        />
      )}

      <Text className="px-6 pt-6 text-xs leading-normal text-account-foreground-muted">
        Connections on this device are managed in Settings.
      </Text>
    </ScrollView>
  );
}

const MACHINE_MENU_ACTIONS = [
  { id: "deregister", title: "Deregister", image: "trash", attributes: { destructive: true } },
] satisfies MenuAction[];

function AccountSectionHeader(props: { readonly children: string }) {
  return (
    <Text className="min-h-4 border-b border-account-border px-6 pt-8 pb-4 text-xs font-medium tracking-[0.3px] text-account-foreground-muted uppercase">
      {props.children}
    </Text>
  );
}

function AccountRow(props: {
  readonly title: string;
  readonly subtitle: string;
  readonly accessory?: ReactNode;
}) {
  return (
    <View
      collapsable={false}
      className="flex-row items-center gap-3 border-b border-account-border px-6 py-4"
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="min-h-[22px] text-base text-account-foreground" numberOfLines={1}>
          {props.title}
        </Text>
        <Text className="min-h-5 text-sm text-account-foreground-muted" numberOfLines={2}>
          {props.subtitle}
        </Text>
      </View>
      {props.accessory}
    </View>
  );
}

function AccountButtonRow(props: { readonly label: string; readonly onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      className="border-b border-account-border px-6 py-4 active:opacity-60"
    >
      <Text className="text-base font-semibold text-account-foreground">{props.label}</Text>
    </Pressable>
  );
}
