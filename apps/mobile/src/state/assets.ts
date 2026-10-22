import { useAtomValue } from "@effect/atom-react";
import { resolveFilesystemReadAccess } from "@vekrel/client-runtime/state/filesystem";
import {
  assetUrlStateFromResult,
  blockedAssetUrlState,
  createAssetMachineAtoms,
  createProjectFaviconUrlAtomFamily,
  EMPTY_ASSET_URL_ATOM,
} from "@vekrel/client-runtime/state/assets";
import type { AssetResource, MachineId } from "@vekrel/contracts";
import { useCallback } from "react";

import { connectionAtomRuntime } from "../connection/runtime";
import { projectFaviconDatabaseCache } from "../lib/projectFaviconDatabaseCache";
import { type AssetUrlState, deriveAssetUrlState } from "./asset-url-state";
import { machineProjectCloneListAtom } from "./projectClones";
import { machineSession, usePreparedConnection } from "./session";
import { useMachinePresentation } from "./presentation";
import { useMachineQuery } from "./query";
import { useAtomQueryRunner } from "./use-atom-query-runner";

export type { AssetUrlFailureReason, AssetUrlState } from "./asset-url-state";

export const assetMachine = createAssetMachineAtoms(connectionAtomRuntime);

export const projectFaviconUrlAtom = createProjectFaviconUrlAtomFamily({
  imageCache: projectFaviconDatabaseCache,
  createUrl: assetMachine.createUrl,
  preparedConnection: machineSession.preparedConnectionValueAtom,
  projectClones: machineProjectCloneListAtom,
});

export function useAssetUrlState(
  machineId: MachineId | null,
  resource: AssetResource | null,
): AssetUrlState {
  const fileAccessSession = useMachineQuery(
    machineId === null ? null : machineSession.sessionStateAtom(machineId),
  );
  const fileMachine = useMachinePresentation(machineId);
  const fileAccess = resolveFilesystemReadAccess({
    isCatalogReady: fileMachine.isReady,
    connection: fileMachine.presentation?.connection ?? null,
    session: fileAccessSession.data,
    sessionError: fileAccessSession.error,
  });
  const blocked = blockedAssetUrlState(resource, fileAccess);
  const preparedConnection = usePreparedConnection(machineId);
  const connectionPhase = fileMachine.presentation?.connection.phase ?? "available";
  const result = useAtomValue(
    blocked !== null || machineId === null || resource === null
      ? EMPTY_ASSET_URL_ATOM
      : assetMachine.createUrl({ machineId, input: { resource } }),
  );
  const shared =
    blocked ??
    assetUrlStateFromResult(
      result,
      preparedConnection._tag === "Some" ? preparedConnection.value.httpBaseUrl : null,
    );
  return deriveAssetUrlState({
    connectionPhase,
    shared: shared._tag === "Failure" && result.waiting ? { _tag: "Loading" } : shared,
  });
}

export function useAssetUrl(
  machineId: MachineId | null,
  resource: AssetResource | null,
): string | null {
  const state = useAssetUrlState(machineId, resource);
  return state._tag === "Success" ? state.url : null;
}

/** Explicit playback and sharing must reauthorize files that may have been replaced on disk. */
export function useRefreshAssetUrl(
  machineId: MachineId | null,
  resource: AssetResource | null,
): () => Promise<string | null> {
  const connection = usePreparedConnection(machineId);
  const httpBaseUrl = connection._tag === "Some" ? connection.value.httpBaseUrl : null;
  const createUrl = useAtomQueryRunner(assetMachine.createUrl, {
    refresh: true,
    reportFailure: false,
  });
  return useCallback(async () => {
    if (machineId === null || resource === null || httpBaseUrl === null) return null;
    const state = assetUrlStateFromResult(
      await createUrl({ machineId, input: { resource } }),
      httpBaseUrl,
    );
    return state._tag === "Success" ? state.url : null;
  }, [createUrl, machineId, httpBaseUrl, resource]);
}
