/**
 * Deferred Result Pi SDK Extension
 *
 * Registers itself as a Pi extension factory. On session_start it subscribes
 * to the DeferredResultStore for the active session's path. When a background
 * task settles it injects an XML-tagged notification into the session via
 * pi.sendMessage(), which Pi routes as a steering message that triggers a new
 * agent turn so the LLM can acknowledge and surface the result to the user.
 *
 * Usage:
 *   import { createDeferredResultExtension } from "./lib/extensions/deferred-result-ext.js";
 *   pi.registerExtension(createDeferredResultExtension(deferredStore));
 */

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatResultNotification(taskId, result, meta) {
  const type = escapeXml(meta?.type || "background-task");
  const body =
    typeof result === "string"
      ? escapeXml(result)
      : escapeXml(JSON.stringify(result, null, 2));
  return `<hana-background-result task-id="${escapeXml(taskId)}" status="success" type="${type}">\n${body}\n</hana-background-result>`;
}

function formatFailNotification(taskId, reason, meta) {
  const type = escapeXml(meta?.type || "background-task");
  return `<hana-background-result task-id="${escapeXml(taskId)}" status="failed" type="${type}">\n${escapeXml(reason)}\n</hana-background-result>`;
}

/**
 * @param {import("../deferred-result-store.js").DeferredResultStore} deferredStore
 * @returns {(pi: object) => void} Pi extension factory
 */
export function createDeferredResultExtension(deferredStore) {
  return function (pi) {
    let sessionPath = null;
    let unsubResult = null;
    let unsubFail = null;

    pi.on("session_start", (event, ctx) => {
      sessionPath = ctx.sessionManager.getSessionFile();

      // Proactive check: query DeferredResultStore for this session's tasks
      // Covers steer loss (cancelled turn), app restart (if tasks re-registered)
      setTimeout(() => {
        try {
          const tasks = deferredStore.listBySession(sessionPath);
          if (!tasks.length) return;
          const pending = tasks.filter((t) => t.status === "pending");
          const resolved = tasks.filter((t) => t.status === "resolved");
          const failed = tasks.filter((t) => t.status === "failed");
          const lines = [];
          if (pending.length) lines.push(`${pending.length} 个后台任务进行中`);
          if (resolved.length) lines.push(`${resolved.length} 个后台任务已完成`);
          if (failed.length) lines.push(`${failed.length} 个后台任务失败`);
          if (!lines.length) return;
          lines.push("使用 check_pending_tasks 工具可查看详情。");
          pi.sendMessage(
            {
              customType: "hana-deferred-task-reminder",
              content: `<hana-deferred-tasks>${lines.join("；")}</hana-deferred-tasks>`,
              display: false,
            },
            { deliverAs: "steer", triggerTurn: false },
          );
        } catch {
          // silently ignore
        }
      }, 500);

      unsubResult = deferredStore.onResult((taskId, sp, result, meta) => {
        if (sp !== sessionPath) return;
        try {
          pi.sendMessage(
            {
              customType: "hana-background-result",
              content: formatResultNotification(taskId, result, meta),
              display: false,
            },
            {
              deliverAs: "steer",
              triggerTurn: true,
            },
          );
        } catch (err) {
          console.error(`[deferred-result-ext] sendMessage failed for ${taskId}:`, err);
        }
      });

      unsubFail = deferredStore.onFail((taskId, sp, reason, meta) => {
        if (sp !== sessionPath) return;
        try {
          pi.sendMessage(
            {
              customType: "hana-background-result",
              content: formatFailNotification(taskId, reason, meta),
              display: false,
            },
            {
              deliverAs: "steer",
              triggerTurn: true,
            },
          );
        } catch (err) {
          console.error(`[deferred-result-ext] sendMessage failed for ${taskId}:`, err);
        }
      });
    });

    pi.on("session_shutdown", () => {
      unsubResult?.();
      unsubFail?.();
      unsubResult = null;
      unsubFail = null;
    });
  };
}
