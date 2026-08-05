import { describe, it, expect, vi } from "vitest";
import { bindCommand } from "./bindCommand.js";

describe("bindCommand", () => {
  it("forwards all VS Code command arguments to the handler", async () => {
    const received: unknown[] = [];
    const onSuccess = vi.fn();
    const onError = vi.fn();

    const handler = bindCommand(async (item: { id: string }, extra?: number) => {
      received.push(item, extra);
    }, { onSuccess, onError });

    const treeItem = { id: "worktree-1" };
    await handler(treeItem, 42);

    expect(received[0]).toBe(treeItem);
    expect(received[1]).toBe(42);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not call onSuccess when handler throws; routes to onError", async () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const err = new Error("boom");

    const handler = bindCommand(async (_item?: { id: string }) => {
      throw err;
    }, { onSuccess, onError });

    await handler({ id: "x" });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(err);
  });
});
