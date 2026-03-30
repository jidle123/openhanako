/**
 * minimaxOAuthProvider.modifyModels 单元测试
 *
 * 验证：
 *   1. 同时匹配 "minimax" 和 "minimax-oauth" provider
 *   2. 只替换域名（origin），保留原有路径（如 /v1）
 *   3. 不影响其他 provider 的模型
 */

import { describe, it, expect } from "vitest";
import { minimaxOAuthProvider } from "../lib/oauth/minimax-portal.js";

const { modifyModels } = minimaxOAuthProvider;

describe("minimaxOAuthProvider.modifyModels", () => {
  it("替换 minimax-oauth 模型的域名，保留路径", () => {
    const models = [
      { provider: "minimax-oauth", id: "M2.7", baseUrl: "https://api.minimaxi.com/v1" },
    ];
    const credentials = { resourceUrl: "https://api.minimax.io/anthropic" };

    const result = modifyModels(models, credentials);
    // 域名从 minimaxi.com → minimax.io，路径保持 /v1
    expect(result[0].baseUrl).toBe("https://api.minimax.io/v1");
  });

  it("替换 minimax (API key) 模型的域名，保留路径", () => {
    const models = [
      { provider: "minimax", id: "M2", baseUrl: "https://api.minimaxi.com/v1" },
    ];
    const credentials = { resourceUrl: "https://api.minimax.io/anthropic" };

    const result = modifyModels(models, credentials);
    expect(result[0].baseUrl).toBe("https://api.minimax.io/v1");
  });

  it("同域名时 baseUrl 不变", () => {
    const models = [
      { provider: "minimax-oauth", id: "M2.7", baseUrl: "https://api.minimaxi.com/v1" },
    ];
    const credentials = { resourceUrl: "https://api.minimaxi.com/anthropic" };

    const result = modifyModels(models, credentials);
    expect(result[0].baseUrl).toBe("https://api.minimaxi.com/v1");
  });

  it("不影响其他 provider 的模型", () => {
    const models = [
      { provider: "dashscope", id: "qwen", baseUrl: "https://dashscope.aliyuncs.com/v1" },
      { provider: "minimax-oauth", id: "M2.7", baseUrl: "https://api.minimaxi.com/v1" },
    ];
    const credentials = { resourceUrl: "https://api.minimax.io/anthropic" };

    const result = modifyModels(models, credentials);
    expect(result[0].baseUrl).toBe("https://dashscope.aliyuncs.com/v1"); // 不变
    expect(result[1].baseUrl).toBe("https://api.minimax.io/v1"); // 域名替换
  });

  it("无 resourceUrl 时原样返回", () => {
    const models = [
      { provider: "minimax-oauth", id: "M2.7", baseUrl: "https://api.minimaxi.com/v1" },
    ];

    expect(modifyModels(models, {})).toEqual(models);
    expect(modifyModels(models, null)).toEqual(models);
    expect(modifyModels(models, { resourceUrl: undefined })).toEqual(models);
  });

  it("resourceUrl 格式异常时原样返回", () => {
    const models = [
      { provider: "minimax-oauth", id: "M2.7", baseUrl: "https://api.minimaxi.com/v1" },
    ];
    const credentials = { resourceUrl: "not-a-url" };

    const result = modifyModels(models, credentials);
    expect(result).toEqual(models);
  });
});
