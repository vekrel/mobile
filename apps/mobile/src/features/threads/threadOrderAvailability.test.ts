import { describe, expect, it } from "vite-plus/test";
import {
  generateSpreadPinOrderKeys,
  pinOrderKeyBetween,
} from "@vekrel/client-runtime/state/thread-sort";
import type { MachineId } from "@vekrel/contracts";

import {
  computeThreadMoveAvailability,
  createThreadMovePlanner,
  type OrderRow,
} from "./threadOrder";

function makeRow(id: string, machineId: string, key: string | null, pinned: boolean): OrderRow {
  return {
    id: id as OrderRow["id"],
    machineId: machineId as OrderRow["machineId"],
    pinOrderKey: pinned ? key : null,
    activeOrderKey: pinned ? null : key,
    createdAt: "2026-01-01T00:00:00.000Z",
    unsettledAt: "2026-01-01T00:00:00.000Z",
    pinnedAt: pinned ? "2026-01-01T00:00:00.000Z" : null,
  };
}

function makeRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const KEY_POOL = [
  "a",
  "b",
  "ba",
  "bb",
  "c",
  "d",
  "ca",
  "cb",
  "da",
  "db",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  "q",
  "r",
  "s",
  "t",
  "u",
  "v",
  "w",
  "x",
  "y",
  "z",
  null,
];

function referenceAvailability(
  ordered: readonly OrderRow[],
  allThreads: readonly OrderRow[],
  writable: ReadonlySet<MachineId>,
) {
  const planner = createThreadMovePlanner({
    ordered,
    allThreads,
    section: "pinned",
    reorderableMachineIds: writable,
  });
  const answers = new Map<string, { canMoveUp: boolean; canMoveDown: boolean }>();
  for (const row of ordered) {
    const movedId = `${row.machineId}:${row.id}`;
    answers.set(movedId, {
      canMoveUp: planner(movedId, "up") !== null,
      canMoveDown: planner(movedId, "down") !== null,
    });
  }
  return answers;
}

function randomCase(rng: () => number) {
  const rowCount = 1 + Math.floor(rng() * 9);
  const rows: OrderRow[] = [];
  for (let index = 0; index < rowCount; index += 1) {
    const machine = rng() < 0.75 ? "env-w" : "env-x";
    const key = KEY_POOL[Math.floor(rng() * KEY_POOL.length)] ?? null;
    const id = rng() < 0.4 ? `t:${index}` : `t${index}`;
    rows.push(makeRow(id, machine, key, true));
  }
  const hidden: OrderRow[] = [];
  const hiddenCount = Math.floor(rng() * 4);
  for (let index = 0; index < hiddenCount; index += 1) {
    const key = KEY_POOL[Math.floor(rng() * KEY_POOL.length)] ?? null;
    const id = rng() < 0.4 ? `h:${index}` : `h${index}`;
    hidden.push(makeRow(id, rng() < 0.75 ? "env-w" : "env-x", key, true));
  }
  return { ordered: rows, allThreads: [...rows, ...hidden] };
}

const WRITABLE = new Set<MachineId>(["env-w" as MachineId]);

describe("computeThreadMoveAvailability matches the reference planner", () => {
  it("agrees across randomized sections (keys, holes, non-writable rows, hidden keys)", () => {
    for (let seed = 1; seed <= 4_000; seed += 1) {
      const rng = makeRng(seed);
      const { ordered, allThreads } = randomCase(rng);
      const batch = computeThreadMoveAvailability({
        ordered,
        allThreads,
        section: "pinned",
        reorderableMachineIds: WRITABLE,
      });
      const reference = referenceAvailability(ordered, allThreads, WRITABLE);
      for (const [id, answer] of reference) {
        expect(
          batch.get(id) ?? { canMoveUp: false, canMoveDown: false },
          `seed ${seed} row ${id} ordered=${ordered
            .map((row) => `${row.id}:${row.pinOrderKey ?? "-"}:${row.machineId}`)
            .join(",")}`,
        ).toEqual(answer);
      }
    }
  });

  it("locks every row while a pending reorder is in flight", () => {
    const rows = [makeRow("t0", "env-w", "a", true), makeRow("t1", "env-w", "c", true)];
    const pending = {
      section: "pinned" as const,
      orderedIds: ["env-w:t1", "env-w:t0"],
      before: new Map(),
      assignments: new Map(),
      confirmed: new Set<string>(),
      commandsComplete: false,
    };
    const batch = computeThreadMoveAvailability({
      ordered: rows,
      section: "pinned",
      reorderableMachineIds: WRITABLE,
      pendingOrder: pending,
    });
    expect(batch.size).toBe(0);
  });

  it("allows the fast-path walk past reserved keys and rewrites that skip matching keys (auditor cases)", () => {
    const rows = [makeRow("t0", "env-w", "f", true), makeRow("t1", "env-x", "gn", true)];
    const withThird = [...rows, makeRow("t2", "env-w", null, true)];
    const batch = computeThreadMoveAvailability({
      ordered: withThird,
      allThreads: withThird,
      section: "pinned",
      reorderableMachineIds: WRITABLE,
    });
    const reference = referenceAvailability(withThird, withThird, WRITABLE);
    expect(Object.fromEntries(batch)).toEqual(Object.fromEntries(reference));
    expect(batch.get("env-w:t0")).toEqual({ canMoveUp: false, canMoveDown: true });
  });

  it("keeps moves available for ids containing colons (composite-id parsing)", () => {
    const rows = [makeRow("thread:1", "env", "a", true), makeRow("thread:2", "env", "c", true)];
    const batch = computeThreadMoveAvailability({
      ordered: rows,
      section: "pinned",
      reorderableMachineIds: new Set<MachineId>(["env" as MachineId]),
    });
    const reference = referenceAvailability(
      rows,
      rows,
      new Set<MachineId>(["env" as MachineId]),
    );
    expect(Object.fromEntries(batch)).toEqual(Object.fromEntries(reference));
    expect(batch.get("env:thread:1")).toEqual({ canMoveUp: false, canMoveDown: true });
    expect(batch.get("env:thread:2")).toEqual({ canMoveUp: true, canMoveDown: false });
  });

  it("answers empty and single-row sections without consulting hidden rows", () => {
    const hidden = [makeRow("h0", "env-w", "b", true), makeRow("h1", "env-x", null, true)];
    expect(
      computeThreadMoveAvailability({
        ordered: [],
        allThreads: hidden,
        section: "pinned",
        reorderableMachineIds: WRITABLE,
      }).size,
    ).toBe(0);
    for (const machine of ["env-w", "env-x"]) {
      const ordered = [makeRow("t0", machine, "a", true)];
      const allThreads = [...ordered, ...hidden];
      const batch = computeThreadMoveAvailability({
        ordered,
        allThreads,
        section: "pinned",
        reorderableMachineIds: WRITABLE,
      });
      expect(Object.fromEntries(batch)).toEqual({
        [`${machine}:t0`]: { canMoveUp: false, canMoveDown: false },
      });
      expect(Object.fromEntries(batch)).toEqual(
        Object.fromEntries(referenceAvailability(ordered, allThreads, WRITABLE)),
      );
    }
  });

  it("denies rows whose section has non-writable neighbours when the fast path fails", () => {
    const rows = [
      makeRow("t0", "env-w", null, true),
      makeRow("t1", "env-x", "c", true),
      makeRow("t2", "env-w", "d", true),
    ];
    const batch = computeThreadMoveAvailability({
      ordered: rows,
      allThreads: rows,
      section: "pinned",
      reorderableMachineIds: WRITABLE,
    });
    const reference = referenceAvailability(rows, rows, WRITABLE);
    expect(Object.fromEntries(batch)).toEqual(Object.fromEntries(reference));
    expect(batch.get("env-x:t1")).toEqual({ canMoveUp: false, canMoveDown: false });
  });

  it("agrees on a section where every adjacency midpoint is a hidden reserved key", () => {
    const visibleKeys = generateSpreadPinOrderKeys(24);
    const hiddenKeys = visibleKeys
      .slice(0, -1)
      .map((key, index) => pinOrderKeyBetween(key, visibleKeys[index + 1]!))
      .filter((key): key is string => key != null);
    const ordered = visibleKeys.map((key, index) => makeRow(`v${index}`, "env-w", key, true));
    const hidden = hiddenKeys.map((key, index) => makeRow(`h${index}`, "env-w", key, true));
    const allThreads = [...ordered, ...hidden];
    const batch = computeThreadMoveAvailability({
      ordered,
      allThreads,
      section: "pinned",
      reorderableMachineIds: WRITABLE,
    });
    const reference = referenceAvailability(ordered, allThreads, WRITABLE);
    expect(Object.fromEntries(batch)).toEqual(Object.fromEntries(reference));
  });
});
