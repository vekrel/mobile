import * as Schema from "effect/Schema";
import { MachineId, PastedTextAttachmentSource } from "@vekrel/contracts";

export const DraftComposerImageAttachmentSchema = Schema.Struct({
  id: Schema.String,
  previewUri: Schema.String,
  type: Schema.Literal("image"),
  name: Schema.String,
  mimeType: Schema.String,
  sizeBytes: Schema.Number,
  fileUri: Schema.optional(Schema.String.check(Schema.isNonEmpty())),
  dataUrl: Schema.optional(Schema.String.check(Schema.isNonEmpty())),
  uploadedAttachmentId: Schema.optional(Schema.String),
  uploadMachineId: Schema.optional(MachineId),
}).check(
  Schema.makeFilter(
    ({ fileUri, dataUrl }) =>
      fileUri !== undefined ||
      dataUrl !== undefined ||
      "Image attachment has no file or inline bytes.",
  ),
);

export const DraftComposerFileAttachmentSchema = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal("file"),
  name: Schema.String,
  mimeType: Schema.String,
  sizeBytes: Schema.Number,
  fileUri: Schema.String,
  source: Schema.optional(PastedTextAttachmentSource),
  uploadedAttachmentId: Schema.optional(Schema.String),
  uploadMachineId: Schema.optional(MachineId),
});

export const DraftComposerAttachmentSchema = Schema.Union([
  DraftComposerImageAttachmentSchema,
  DraftComposerFileAttachmentSchema,
]);
