import {
  isNullableProjectSettingsOverride,
  PROJECT_SCOPED_SERVER_SETTING_KEYS,
  type MachineId,
  type ProjectId,
  type ProjectScopedServerSettingKey,
  type ServerSettings,
  type ServerSettingsPatch,
} from "@vekrel/contracts";
import {
  clearProjectSettingsOverrides,
  resolveProjectSettings,
} from "@vekrel/shared/projectSettings";

import type { SettingsTarget } from "./settings-machine-filter";

export interface ScopedMobileSettingsTarget {
  readonly machine: SettingsTarget;
  readonly projectId: ProjectId | null;
  readonly settings: ServerSettings;
  readonly sources: ReturnType<typeof resolveProjectSettings>["sources"];
}

export function resolveMobileSettingsTargets(
  machines: readonly SettingsTarget[],
  members: readonly { readonly machineId: MachineId; readonly id: ProjectId }[] | null,
): readonly ScopedMobileSettingsTarget[] {
  if (members === null) {
    return machines.map((machine) => ({
      machine,
      projectId: null,
      ...resolveProjectSettings(machine.serverConfig.settings, null),
    }));
  }
  const byId = new Map(machines.map((machine) => [machine.machineId, machine]));
  return members.flatMap((member) => {
    const machine = byId.get(member.machineId);
    if (!machine) return [];
    return [
      {
        machine,
        projectId: member.id,
        ...resolveProjectSettings(machine.serverConfig.settings, member.id),
      },
    ];
  });
}

export function planMobileScopedSettingsPatch(
  targets: readonly ScopedMobileSettingsTarget[],
  projectSelected: boolean,
  patch: ServerSettingsPatch,
) {
  if (!projectSelected) {
    return targets.map((target) => ({ machineId: target.machine.machineId, patch }));
  }
  const keys = Object.keys(patch);
  if (
    keys.some(
      (key) => !PROJECT_SCOPED_SERVER_SETTING_KEYS.includes(key as ProjectScopedServerSettingKey),
    )
  )
    return [];
  const writes = new Map<MachineId, Record<string, unknown>>();
  for (const target of targets) {
    if (
      target.projectId === null ||
      target.machine.serverConfig.machine.capabilities.projectSettingsOverrides !== true
    )
      continue;
    const current =
      target.machine.serverConfig.settings.projectSettingsOverrides[target.projectId] ?? {};
    const next: Record<string, unknown> = { ...current };
    for (const [key, value] of Object.entries(patch)) {
      if (
        value === null &&
        !isNullableProjectSettingsOverride(key as ProjectScopedServerSettingKey)
      ) {
        delete next[key];
      } else {
        next[key] = value;
      }
    }
    const overrides = writes.get(target.machine.machineId) ?? {};
    overrides[target.projectId] = next;
    writes.set(target.machine.machineId, overrides);
  }
  return [...writes].map(([machineId, projectSettingsOverrides]) => ({
    machineId,
    patch: { projectSettingsOverrides } as ServerSettingsPatch,
  }));
}

export function uniformMobileSetting<K extends keyof ServerSettings>(
  targets: readonly Pick<ScopedMobileSettingsTarget, "settings">[],
  key: K,
): ServerSettings[K] | null {
  const reference = targets[0];
  if (!reference) return null;
  const value = reference.settings[key];
  return targets.every((target) => target.settings[key] === value) ? value : null;
}

export function planMobileScopedSettingsClear(
  targets: readonly ScopedMobileSettingsTarget[],
  keys: readonly ProjectScopedServerSettingKey[],
) {
  const writes = new Map<MachineId, Record<string, unknown>>();
  for (const target of targets) {
    if (
      target.projectId === null ||
      target.machine.serverConfig.machine.capabilities.projectSettingsOverrides !== true
    )
      continue;
    const overrides = writes.get(target.machine.machineId) ?? {};
    overrides[target.projectId] = clearProjectSettingsOverrides(
      target.machine.serverConfig.settings,
      target.projectId,
      keys,
    );
    writes.set(target.machine.machineId, overrides);
  }
  return [...writes].map(([machineId, projectSettingsOverrides]) => ({
    machineId,
    patch: { projectSettingsOverrides } as ServerSettingsPatch,
  }));
}
