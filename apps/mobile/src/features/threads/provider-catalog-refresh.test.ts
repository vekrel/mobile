import { MachineId } from "@vekrel/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  createProviderCatalogRefreshRunner,
  providerCatalogRefreshError,
} from "./provider-catalog-refresh";

describe("mobile provider catalog refresh", () => {
  it("requests model discovery for the selected machine and deduplicates pending taps", async () => {
    let resolveRefresh: ((value: "refreshed") => void) | undefined;
    const refreshProviders = vi.fn(
      () =>
        new Promise<"refreshed">((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    const refresh = createProviderCatalogRefreshRunner(refreshProviders);
    const machineId = MachineId.make("machine-mobile");

    const first = refresh(machineId);
    const second = refresh(machineId);

    expect(second).toBe(first);
    expect(refreshProviders).toHaveBeenCalledOnce();
    expect(refreshProviders).toHaveBeenCalledWith({
      machineId,
      input: { refreshModels: true },
    });

    resolveRefresh?.("refreshed");
    await expect(first).resolves.toBe("refreshed");
  });

  it("reports a discovery error and allows retry after the failed command settles", async () => {
    const failure = AsyncResult.failure<never, Error>(Cause.fail(new Error("discovery failed")));
    const success = AsyncResult.success("refreshed");
    let callCount = 0;
    const refreshProviders = vi.fn(async () => (callCount++ === 0 ? failure : success));
    const refresh = createProviderCatalogRefreshRunner(refreshProviders);
    const machineId = MachineId.make("machine-mobile");

    expect(providerCatalogRefreshError(await refresh(machineId))).toBe("discovery failed");
    expect(providerCatalogRefreshError(await refresh(machineId))).toBeNull();
    expect(refreshProviders).toHaveBeenCalledTimes(2);
  });
});
