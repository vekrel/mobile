import { resolveFilesystemReadAccess } from "@vekrel/client-runtime/state/filesystem";
import { useMachinePresentation } from "../state/presentation";
import { useMachineQuery } from "../state/query";
import { resolveMobileMarkdownMediaSource } from "../lib/markdownMediaSource";
import { resolveAssetUrl } from "@vekrel/client-runtime/state/assets";
import type { MachineId, ThreadId } from "@vekrel/contracts";
import type { MarkdownImageSourceResolver } from "./SelectableMarkdownText.types";
import { normalizeNativeMarkdownUrl } from "../lib/markdownLinks";
import { useCallback } from "react";
import * as Option from "effect/Option";

import { assetMachine } from "../state/assets";
import { machineSession, usePreparedConnection } from "../state/session";
import { useAtomQueryRunner } from "../state/use-atom-query-runner";

export function useMarkdownImageSource(props: {
  readonly machineId: MachineId;
  readonly threadId: ThreadId | null;
  readonly workspaceRoot: string | null;
  readonly captured?: boolean;
}): MarkdownImageSourceResolver {
  const { machineId, threadId, workspaceRoot, captured } = props;
  const connection = usePreparedConnection(machineId);
  const machine = useMachinePresentation(machineId);
  const connectionPhase = machine.presentation?.connection.phase;
  const session = useMachineQuery(machineSession.sessionStateAtom(machineId));
  const fileAccess = resolveFilesystemReadAccess({
    isCatalogReady: machine.isReady,
    connection: machine.presentation?.connection ?? null,
    session: session.data,
    sessionError: session.error,
  });
  const httpBaseUrl = Option.isSome(connection) ? connection.value.httpBaseUrl : null;
  const createUrl = useAtomQueryRunner(assetMachine.createUrl, { reportFailure: false });
  return useCallback(
    async (image) => {
      const media = resolveMobileMarkdownMediaSource(image.href, {
        threadId: threadId ?? undefined,
        workspaceRoot,
        imageEmbed: true,
      });
      if (media?.access === "direct") return { uri: normalizeNativeMarkdownUrl(media.uri) };
      if (
        captured ||
        !fileAccess.canReadFiles ||
        media === null ||
        media.access === "unavailable" ||
        httpBaseUrl === null ||
        connectionPhase === "offline" ||
        connectionPhase === "error" ||
        connectionPhase === "unsupported" ||
        connectionPhase === "reconnecting"
      )
        throw new Error("Markdown image is unavailable");
      const result = await createUrl({ machineId, input: { resource: media.resource } });
      if (result._tag !== "Success") throw new Error("Could not authorize Markdown image");
      const uri = resolveAssetUrl(httpBaseUrl, result.value.relativeUrl);
      if (uri === null) throw new Error("Markdown image URL is invalid");
      return { uri };
    },
    [
      captured,
      fileAccess.canReadFiles,
      connectionPhase,
      createUrl,
      machineId,
      httpBaseUrl,
      threadId,
      workspaceRoot,
    ],
  );
}
