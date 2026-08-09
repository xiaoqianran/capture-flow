import { describe, expect, it } from "vitest";
import {
  shortcutChordFromEvent,
  shouldIgnoreShortcutEvent,
} from "@capture-flow/core";

describe("shortcuts pure core", () => {
  it("builds Alt+Shift+C chord", () => {
    const chord = shortcutChordFromEvent({
      key: "c",
      altKey: true,
      shiftKey: true,
    });
    expect(chord).toBe("Alt+Shift+C");
  });

  it("ignores editable targets", () => {
    const input = { tagName: "INPUT" } as unknown as EventTarget;
    expect(
      shouldIgnoreShortcutEvent({ key: "c", altKey: true, target: input }),
    ).toBe(true);
  });
});
