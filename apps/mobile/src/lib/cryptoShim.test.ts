import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("expo-crypto", () => ({ getRandomValues: vi.fn() }));

import * as ExpoCrypto from "expo-crypto";
import { installCryptoShim } from "./cryptoShim";

describe("installCryptoShim", () => {
  it("installs expo-crypto when crypto or getRandomValues is missing", () => {
    const bare: { crypto?: { getRandomValues?: unknown } } = {};
    installCryptoShim(bare);
    expect(bare.crypto?.getRandomValues).toBe(ExpoCrypto.getRandomValues);

    const partial: { crypto?: { getRandomValues?: unknown; subtle?: unknown } } = {
      crypto: { subtle: "kept" },
    };
    installCryptoShim(partial);
    expect(partial.crypto).toEqual({ subtle: "kept", getRandomValues: ExpoCrypto.getRandomValues });
  });

  it("leaves a native getRandomValues untouched", () => {
    const native = () => undefined;
    const host = { crypto: { getRandomValues: native } };
    installCryptoShim(host);
    expect(host.crypto.getRandomValues).toBe(native);
    expect(globalThis.crypto.getRandomValues).not.toBe(ExpoCrypto.getRandomValues);
  });
});
