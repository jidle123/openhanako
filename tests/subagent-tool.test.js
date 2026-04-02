import { describe, expect, it, vi } from "vitest";
import { createSubagentTool } from "../lib/tools/subagent-tool.js";

describe("subagent-tool", () => {
  it("dispatches task via deferred store and returns immediately", async () => {
    const executeIsolated = vi.fn().mockResolvedValue({
      replyText: "done",
      error: null,
    });

    const mockStore = {
      defer: vi.fn(),
      resolve: vi.fn(),
      fail: vi.fn(),
    };

    const tool = createSubagentTool({
      executeIsolated,
      resolveUtilityModel: () => "utility-model",
      readOnlyBuiltinTools: ["read", "grep", "find", "ls"],
      getDeferredStore: () => mockStore,
      getSessionPath: () => "/test/session.jsonl",
    });

    const result = await tool.execute("call_1", { task: "查一下项目状态" });

    // 立即返回 dispatched 消息（t() 在测试环境返回 key）
    expect(result.content[0].text).toContain("subagentDispatched");

    // store.defer 应该被调用
    expect(mockStore.defer).toHaveBeenCalledWith(
      expect.stringMatching(/^subagent-/),
      "/test/session.jsonl",
      expect.objectContaining({ type: "subagent" }),
    );

    // executeIsolated 应该被调用（后台执行）
    expect(executeIsolated).toHaveBeenCalledWith(
      expect.stringContaining("任务：\n查一下项目状态"),
      expect.objectContaining({
        model: "utility-model",
        toolFilter: "*",
        builtinFilter: ["read", "grep", "find", "ls"],
      }),
    );

    // 等 promise 链走完
    await vi.waitFor(() => {
      expect(mockStore.resolve).toHaveBeenCalledWith(
        expect.stringMatching(/^subagent-/),
        "done",
      );
    });
  });

  it("calls store.fail when execution errors", async () => {
    const executeIsolated = vi.fn().mockRejectedValue(new Error("boom"));

    const mockStore = {
      defer: vi.fn(),
      resolve: vi.fn(),
      fail: vi.fn(),
    };

    const tool = createSubagentTool({
      executeIsolated,
      resolveUtilityModel: () => "utility-model",
      readOnlyBuiltinTools: ["read"],
      getDeferredStore: () => mockStore,
      getSessionPath: () => "/test/session.jsonl",
    });

    await tool.execute("call_1", { task: "会失败的任务" });

    await vi.waitFor(() => {
      expect(mockStore.fail).toHaveBeenCalledWith(
        expect.stringMatching(/^subagent-/),
        "boom",
      );
    });
  });

  it("falls back to sync execution when deferred store is unavailable", async () => {
    const executeIsolated = vi.fn().mockResolvedValue({
      replyText: "sync result",
      error: null,
    });

    const tool = createSubagentTool({
      executeIsolated,
      resolveUtilityModel: () => "utility-model",
      readOnlyBuiltinTools: ["read"],
      getDeferredStore: () => null,
      getSessionPath: () => null,
    });

    const result = await tool.execute("call_1", { task: "同步任务" });

    expect(result).toEqual({
      content: [{ type: "text", text: "sync result" }],
    });
  });

  it("rejects new work when the concurrency limit is reached", async () => {
    const releases = [];
    const executeIsolated = vi.fn().mockImplementation(() => new Promise((resolve) => {
      releases.push(resolve);
    }));

    const mockStore = {
      defer: vi.fn(),
      resolve: vi.fn(),
      fail: vi.fn(),
    };

    const tool = createSubagentTool({
      executeIsolated,
      resolveUtilityModel: () => "utility-model",
      readOnlyBuiltinTools: ["read"],
      getDeferredStore: () => mockStore,
      getSessionPath: () => "/test/session.jsonl",
    });

    const running = [
      tool.execute("call_1", { task: "任务 1" }),
      tool.execute("call_2", { task: "任务 2" }),
      tool.execute("call_3", { task: "任务 3" }),
    ];

    // 等前 3 个都派出
    await Promise.all(running);

    const blocked = await tool.execute("call_4", { task: "任务 4" });

    expect(blocked).toEqual({
      content: [{ type: "text", text: "error.subagentMaxConcurrent" }],
    });

    for (const release of releases) {
      release({ replyText: "ok", error: null });
    }
    expect(executeIsolated).toHaveBeenCalledTimes(3);
  });
});
