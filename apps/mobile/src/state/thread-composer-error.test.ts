import { afterEach, describe, expect, it } from "vite-plus/test";

import { appAtomRegistry } from "./atom-registry";
import {
  clearThreadComposerErrorsForMachine,
  setThreadComposerError,
  threadComposerErrorsAtom,
} from "./thread-composer-error";

afterEach(() => {
  appAtomRegistry.set(threadComposerErrorsAtom, {});
});

describe("thread composer errors", () => {
  it("clears every thread's error for a removed machine and no others", () => {
    setThreadComposerError("machine-1:thread-1", "one");
    setThreadComposerError("machine-1:thread-2", "two");
    setThreadComposerError("machine-10:thread-1", "other machine");

    clearThreadComposerErrorsForMachine("machine-1");

    expect(Object.keys(appAtomRegistry.get(threadComposerErrorsAtom))).toEqual([
      "machine-10:thread-1",
    ]);
  });
});
