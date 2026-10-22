import { describe, expect, it } from "vite-plus/test";
import { MachineId } from "@vekrel/contracts";
import type { FilePreviewItem } from "../components/FilePreviewModal.types";
import { filePreviewGallery, filePreviewKey } from "./filePreviewGallery";

describe("image preview groups", () => {
  it("matches remote originals despite metadata and property order differences", () => {
    const machineId = MachineId.make("test");
    const a: FilePreviewItem = {
      kind: "image",
      machineId,
      resource: { _tag: "attachment", attachmentId: "a", fileName: "old.png" },
    };
    const b: FilePreviewItem = {
      kind: "image",
      machineId,
      resource: {
        attachmentId: "a",
        _tag: "attachment",
        fileName: "new.png",
        mimeType: "image/png",
      },
    };
    expect(filePreviewKey(a)).toBe(filePreviewKey(b));
    expect(filePreviewGallery(b, [a])).toEqual([b]);
  });
});
