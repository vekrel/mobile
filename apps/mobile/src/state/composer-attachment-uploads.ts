import { settlePromise, squashAtomCommandFailure } from "@vekrel/client-runtime/state/runtime";
import { useAtomValue } from "@effect/atom-react";
import { AuthOrchestrationOperateScope, type MachineId } from "@vekrel/contracts";
import { Atom, AsyncResult } from "effect/reactivity";
import { useEffect, useRef } from "react";

import { prepareTurnAttachments } from "../lib/attachmentUpload";
import { retainComposerAttachmentFileForPreview } from "../lib/composerAttachmentPreviewRetention";
import { isFileBackedComposerAttachment } from "../lib/composerImages";
import {
  composerAttachmentUploadKey,
  composerDraftMachineId,
  canUploadComposerAttachment,
  createComposerAttachmentUploadQueue,
  type ComposerAttachmentUploadState,
} from "../lib/composerAttachmentUploadQueue";
import { appAtomRegistry } from "./atom-registry";
import { useServerConfigs } from "./entities";
import { flattenQueuedThreadMessages, threadOutboxManager } from "./thread-outbox";
import { useThreadOutboxMessages } from "./use-thread-outbox";
import {
  ComposerDraftPersistenceError,
  composerDraftsAtom,
  composerDraftUploadSourcesAtom,
  ensureComposerDraftsLoaded,
  flushComposerDrafts,
  setComposerDraftAttachmentUpload,
} from "./use-composer-drafts";
import { useRemoteConnectionStatus } from "./use-remote-machine-registry";
import { readMachineScope, useMachinesWithScope } from "./session";

export {
  composerAttachmentUploadBlockReason,
  composerAttachmentsStillUploading,
} from "../lib/composerAttachmentUploadQueue";

export const composerAttachmentUploadsAtom = Atom.make<
  Readonly<Record<string, ComposerAttachmentUploadState>>
>({}).pipe(Atom.keepAlive);
const uploadStateAtom = Atom.family((key: string) =>
  Atom.map(composerAttachmentUploadsAtom, (states) => states[key]),
);
let uploadQueue: ReturnType<typeof createComposerAttachmentUploadQueue> | null = null;

export function useComposerAttachmentUploadState(
  machineId: MachineId | undefined,
  attachmentId: string,
) {
  return useAtomValue(
    uploadStateAtom(machineId ? composerAttachmentUploadKey(machineId, attachmentId) : ""),
  );
}

export function retryComposerAttachmentUpload(machineId: MachineId, attachmentId: string) {
  if (!readMachineScope(machineId, AuthOrchestrationOperateScope)) return;
  uploadQueue?.retry(machineId, attachmentId);
}

export function useComposerAttachmentUploadWorker() {
  const drafts = useAtomValue(composerDraftUploadSourcesAtom);
  const queuedMessages = useThreadOutboxMessages();
  const serverConfigs = useServerConfigs();
  const { connectedMachines } = useRemoteConnectionStatus();
  const operableMachines = useMachinesWithScope(
    connectedMachines,
    AuthOrchestrationOperateScope,
  );
  const queueRef = useRef<ReturnType<typeof createComposerAttachmentUploadQueue> | null>(null);

  useEffect(() => {
    ensureComposerDraftsLoaded();
    const queue = createComposerAttachmentUploadQueue({
      onChange: (states) => appAtomRegistry.set(composerAttachmentUploadsAtom, states),
      upload: async ({ machineId, attachment }, signal, onProgress) => {
        const release = isFileBackedComposerAttachment(attachment)
          ? retainComposerAttachmentFileForPreview(attachment)
          : undefined;
        const prepared = await settlePromise(() =>
          prepareTurnAttachments({
            machineId,
            attachments: [attachment],
            supportsImageUploads: true,
            signal,
            onUploadProgress: (_, progress) => onProgress(progress),
            persistUploadedReferences: async ([uploaded]) => {
              if (signal.aborted || !uploaded) return "abandon";
              const queued = flattenQueuedThreadMessages(
                appAtomRegistry.get(threadOutboxManager.queuedMessagesByThreadKeyAtom),
              );
              let retained = false;
              for (const [key, draft] of Object.entries(appAtomRegistry.get(composerDraftsAtom))) {
                if (
                  composerDraftMachineId(key, queued, draft) === machineId &&
                  draft.attachments.some((candidate) => candidate.id === attachment.id)
                ) {
                  retained = setComposerDraftAttachmentUpload(key, uploaded) || retained;
                }
              }
              if (!retained) return "abandon";
              // The reference is already in the in-memory draft, and Send copies it into the
              // outbox, which saves on its own. A failed draft save only costs a re-upload after
              // a restart, so it must not fail an upload the server already accepted.
              await flushComposerDrafts().catch((error: unknown) => {
                if (!(error instanceof ComposerDraftPersistenceError)) throw error;
                console.warn("[composer-attachments] could not save the uploaded reference", error);
              });
              return "persisted";
            },
          }),
        );
        release?.();
        // The upload queue owns retry and failure reporting, so a failed upload rethrows to it.
        if (AsyncResult.isFailure(prepared)) throw squashAtomCommandFailure(prepared);
        return prepared.value.status === "ready";
      },
    });
    queueRef.current = queue;
    uploadQueue = queue;
    return () => {
      queue.dispose();
      if (uploadQueue === queue) uploadQueue = null;
      queueRef.current = null;
    };
  }, []);

  useEffect(() => {
    const queued = flattenQueuedThreadMessages(queuedMessages);
    const connected = new Set(
      connectedMachines
        .filter((machine) => machine.connectionState === "connected")
        .map((machine) => machine.machineId),
    );
    const requests = Object.entries(drafts).flatMap(([key, draft]) => {
      const machineId = composerDraftMachineId(key, queued, draft);
      if (
        machineId === null ||
        !connected.has(machineId) ||
        !operableMachines.has(machineId)
      )
        return [];
      return draft.attachments
        .filter((attachment) =>
          canUploadComposerAttachment(attachment, serverConfigs.get(machineId)),
        )
        .map((attachment) => ({ machineId, attachment }));
    });
    queueRef.current?.sync(requests);
  }, [connectedMachines, drafts, operableMachines, queuedMessages, serverConfigs]);
}
