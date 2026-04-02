/**
 * ask-agent-tool.js — 跨 Agent 调用（非阻塞）
 *
 * 借用另一个 agent 的身份视角和模型能力做单次回复。
 * 任务在后台执行，完成后通过 DeferredResultStore → deferred-result-ext
 * 以 steer 消息注入对话，触发新一轮 LLM turn。
 *
 * discovery 模式：agent="?" 时列出所有可用 agent 的能力说明（同步返回）。
 */

import { Type } from "@sinclair/typebox";
import { t } from "../../server/i18n.js";
import { runAgentSession } from "../../hub/agent-executor.js";

/** 格式化 agent 列表条目（summary + model） */
function formatAgentEntry(a) {
  const label = a.name && a.name !== a.id ? `${a.id} (${a.name})` : a.id;
  const parts = [label];
  if (a.model) parts.push(`[${a.model}]`);
  if (a.summary) parts.push(a.summary);
  return parts.join(" — ");
}

/**
 * @param {object} opts
 * @param {string} opts.agentId - 当前 agent ID
 * @param {() => Array<{id: string, name: string, summary?: string, model?: string}>} opts.listAgents
 * @param {import('../../core/engine.js').HanaEngine} opts.engine
 * @param {() => import("../deferred-result-store.js").DeferredResultStore|null} opts.getDeferredStore
 * @param {() => string|null} opts.getSessionPath
 */
export function createAskAgentTool({ agentId, listAgents, engine, getDeferredStore, getSessionPath }) {
  return {
    name: "ask_agent",
    label: t("toolDef.askAgent.label"),
    description: t("toolDef.askAgent.description"),
    parameters: Type.Object({
      agent: Type.String({ description: t("toolDef.askAgent.agentDesc") }),
      task: Type.Optional(Type.String({ description: t("toolDef.askAgent.taskDesc") })),
    }),

    execute: async (_toolCallId, params, signal) => {
      // discovery 模式：列出所有可用 agent（同步）
      if (params.agent === "?" || params.agent === "list") {
        const agents = listAgents().filter(a => a.id !== agentId);
        if (!agents.length) {
          return { content: [{ type: "text", text: t("error.noOtherAgents") }] };
        }
        const lines = agents.map(a => "- " + formatAgentEntry(a));
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      if (params.agent === agentId) {
        return { content: [{ type: "text", text: t("error.cannotCallSelf") }] };
      }

      if (!params.task) {
        return { content: [{ type: "text", text: t("error.askAgentNoTask") }] };
      }

      const agents = listAgents();
      const target = agents.find(a => a.id === params.agent);
      if (!target) {
        const lines = agents
          .filter(a => a.id !== agentId)
          .map(a => formatAgentEntry(a));
        return {
          content: [{ type: "text", text: t("error.agentNotFoundAvailable", { id: params.agent, ids: lines.join("\n") || "(none)" }) }],
        };
      }

      const store = getDeferredStore?.();
      const sessionPath = getSessionPath?.();

      if (!store || !sessionPath) {
        // 极端 fallback：deferred 基础设施不可用时同步执行
        return _executeSyncFallback({ engine, agentId, target, params, signal });
      }

      const taskId = `ask-agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const taskSummary = params.task.length > 80
        ? params.task.slice(0, 80) + "…"
        : params.task;

      store.defer(taskId, sessionPath, {
        type: "ask-agent",
        agentName: target.name,
        summary: taskSummary,
      });

      // 后台执行，不用 parent signal
      runAgentSession(
        params.agent,
        [{ text: params.task, capture: true }],
        {
          engine,
          sessionSuffix: "ask-temp",
          keepSession: false,
          noMemory: true,
          readOnly: true,
        },
      ).then(reply => {
        store.resolve(taskId, reply || t("error.agentNoReply", { name: target.name }));
      }).catch(err => {
        store.fail(taskId, err.message || String(err));
      });

      return {
        content: [{ type: "text", text: t("error.askAgentDispatched", { name: target.name, taskId }) }],
        details: { from: agentId, to: params.agent, agentName: target.name },
      };
    },
  };
}

/** deferred store 不可用时的同步 fallback */
async function _executeSyncFallback({ engine, agentId, target, params, signal }) {
  try {
    const reply = await runAgentSession(
      params.agent,
      [{ text: params.task, capture: true }],
      {
        engine,
        signal,
        sessionSuffix: "ask-temp",
        keepSession: false,
        noMemory: true,
        readOnly: true,
      },
    );

    return {
      content: [{ type: "text", text: reply || t("error.agentNoReply", { name: target.name }) }],
      details: { from: agentId, to: params.agent, agentName: target.name },
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: t("error.agentCallFailed", { name: target.name, msg: err.message }) }],
    };
  }
}
