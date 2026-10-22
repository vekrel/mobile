import type { MediaReference } from "@vekrel/client-runtime/media-reference";
import type { AssetResource, MachineId, ThreadId } from "@vekrel/contracts";
import type { FileBackedComposerAttachment } from "./composerImages";

export type MediaActionsSource = {
  readonly reference?: MediaReference;
  readonly name: string;
  readonly mimeType: string;
  readonly sourceIdentifier?: string;
} & (
  | { readonly uri: string }
  | { readonly attachment: FileBackedComposerAttachment }
  | {
      readonly machineId: MachineId;
      readonly threadId?: ThreadId;
      readonly resource: AssetResource;
    }
);
