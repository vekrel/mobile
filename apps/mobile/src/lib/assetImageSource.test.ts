import { MachineId } from "@vekrel/contracts";
import { describe, expect, it } from "vite-plus/test";

import { assetImageSource } from "./assetImageSource";

const machineId = MachineId.make("machine-1");

describe("assetImageSource", () => {
  it("caches an attachment under one key across re-signed URLs", () => {
    const resource = { _tag: "attachment", attachmentId: "thread-1-photo.jpg" } as const;
    const first = assetImageSource(
      machineId,
      resource,
      "https://host/api/assets/token-a/p.jpg",
    );
    const second = assetImageSource(
      machineId,
      resource,
      "https://host/api/assets/token-b/p.jpg",
    );

    expect(first.cacheKey).toBeDefined();
    expect(second).toStrictEqual({
      uri: "https://host/api/assets/token-b/p.jpg",
      cacheKey: first.cacheKey,
    });
    expect(
      assetImageSource(MachineId.make("machine-2"), resource, "https://other/p.jpg")
        .cacheKey,
    ).not.toBe(first.cacheKey);
  });

  it("keeps ids that contain colons from sharing a key", () => {
    const uri = "https://host/api/assets/token/p.jpg";
    const left = assetImageSource(
      MachineId.make("a"),
      { _tag: "attachment", attachmentId: "b:c" },
      uri,
    );
    const right = assetImageSource(
      MachineId.make("a:b"),
      { _tag: "attachment", attachmentId: "c" },
      uri,
    );

    expect(left.cacheKey).not.toBe(right.cacheKey);
  });

  it("keeps workspace files keyed by URL because they can change on disk", () => {
    const source = assetImageSource(
      machineId,
      { _tag: "draft-workspace-file", cwd: "/repo", path: "logo.png" },
      "https://host/api/assets/token-a/logo.png",
    );

    expect(source).toStrictEqual({ uri: "https://host/api/assets/token-a/logo.png" });
  });
});
