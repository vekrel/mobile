import { describe, expect, it } from "@effect/vitest";
import { MachineId } from "@vekrel/contracts";
import * as Effect from "effect/Effect";

import { migrateLegacyConnectionCatalog } from "./migration";

describe("migrateLegacyConnectionCatalog", () => {
  it.effect("migrates bearer and relay-managed connections into the new catalog", () =>
    Effect.gen(function* () {
      const bearerMachineId = MachineId.make("bearer-machine");
      const relayMachineId = MachineId.make("relay-machine");
      const catalog = yield* migrateLegacyConnectionCatalog(
        JSON.stringify({
          connections: [
            {
              machineId: bearerMachineId,
              machineLabel: "Local Mac",
              pairingUrl: "https://local.example.test/pair",
              displayUrl: "https://local.example.test",
              httpBaseUrl: "https://local.example.test",
              wsBaseUrl: "wss://local.example.test",
              bearerToken: "bearer-token",
              authenticationMethod: "bearer",
            },
            {
              machineId: relayMachineId,
              machineLabel: "Cloud Mac",
              pairingUrl: "https://relay.example.test",
              displayUrl: "https://relay.example.test",
              httpBaseUrl: "https://relay.example.test",
              wsBaseUrl: "wss://relay.example.test",
              bearerToken: null,
              authenticationMethod: "dpop",
              relayManaged: true,
            },
          ],
        }),
      );

      expect(catalog.targets).toHaveLength(2);
      expect(
        catalog.targets.find((target) => target.machineId === bearerMachineId)?._tag,
      ).toBe("BearerConnectionTarget");
      expect(
        catalog.targets.find((target) => target.machineId === relayMachineId)?._tag,
      ).toBe("RelayConnectionTarget");
      expect(catalog.profiles).toHaveLength(1);
      expect(catalog.credentials).toHaveLength(1);
      expect(catalog.credentials[0]?.credential).toMatchObject({
        _tag: "BearerConnectionCredential",
        token: "bearer-token",
      });
    }),
  );

  it.effect("drops invalid legacy bearer entries without credentials", () =>
    Effect.gen(function* () {
      const catalog = yield* migrateLegacyConnectionCatalog(
        JSON.stringify({
          connections: [
            {
              machineId: MachineId.make("invalid-bearer"),
              machineLabel: "Invalid",
              pairingUrl: "https://invalid.example.test/pair",
              displayUrl: "https://invalid.example.test",
              httpBaseUrl: "https://invalid.example.test",
              wsBaseUrl: "wss://invalid.example.test",
              bearerToken: null,
              authenticationMethod: "bearer",
            },
          ],
        }),
      );

      expect(catalog.targets).toEqual([]);
    }),
  );
});
