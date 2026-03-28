import { Hono } from "hono";

/**
 * 代理分发：将 /plugins/:pluginId/* 的请求转发到对应 plugin 子 app。
 * @param {import("hono").Context} c
 * @param {import("hono").Hono} pluginApp
 * @param {string} pluginId
 */
async function proxyToPlugin(c, pluginApp, pluginId) {
  const url = new URL(c.req.url);
  const prefix = `/plugins/${pluginId}`;
  const prefixIndex = url.pathname.indexOf(prefix);
  const subPath = prefixIndex !== -1
    ? url.pathname.slice(prefixIndex + prefix.length) || "/"
    : "/";
  url.pathname = subPath;

  const subReq = new Request(url.toString(), {
    method: c.req.method,
    headers: c.req.raw.headers,
    body: c.req.method !== "GET" && c.req.method !== "HEAD"
      ? c.req.raw.body
      : undefined,
  });
  return pluginApp.fetch(subReq);
}

/**
 * Standalone route proxy (for tests).
 * @param {Map<string, import("hono").Hono>} routeRegistry
 */
export function createPluginProxyRoute(routeRegistry) {
  const route = new Hono();
  route.all("/plugins/:pluginId/*", async (c) => {
    const pluginId = c.req.param("pluginId");
    const pluginApp = routeRegistry.get(pluginId);
    if (!pluginApp) return c.json({ error: `Plugin "${pluginId}" not found` }, 404);
    return proxyToPlugin(c, pluginApp, pluginId);
  });
  return route;
}

/**
 * Plugin management REST API + route proxy (combined).
 * @param {import('../../core/engine.js').HanaEngine} engine
 */
export function createPluginsRoute(engine) {
  const route = new Hono();

  // ── Management API (specific routes first) ──

  route.get("/plugins", (c) => {
    const pm = engine.pluginManager;
    if (!pm) return c.json([]);
    const source = c.req.query("source"); // ?source=community 或 ?source=builtin
    let plugins = pm.listPlugins();
    if (source) plugins = plugins.filter(p => p.source === source);
    return c.json(plugins.map(p => ({
      id: p.id, name: p.name, version: p.version,
      description: p.description, status: p.status,
      source: p.source || "community",
      contributions: p.contributions,
      error: p.error || null,
    })));
  });

  route.get("/plugins/config-schemas", (c) => {
    const pm = engine.pluginManager;
    return c.json(pm?.getAllConfigSchemas() || []);
  });

  route.get("/plugins/:id/config-schema", (c) => {
    const pm = engine.pluginManager;
    const schema = pm?.getConfigSchema(c.req.param("id"));
    if (!schema) return c.json({ error: "not found" }, 404);
    return c.json(schema);
  });

  // ── Plugin route proxy (catch-all last) ──

  route.all("/plugins/:pluginId/*", async (c) => {
    const pluginId = c.req.param("pluginId");
    const pluginApp = engine.pluginManager?.routeRegistry.get(pluginId);
    if (!pluginApp) return c.json({ error: `Plugin "${pluginId}" not found` }, 404);
    return proxyToPlugin(c, pluginApp, pluginId);
  });

  return route;
}
