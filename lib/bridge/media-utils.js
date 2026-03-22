/**
 * media-utils.js — Bridge 媒体工具层
 *
 * 对标 OpenClaw 的 loadWebMedia + splitMediaFromOutput。
 * 集中处理入站媒体下载和出站回复媒体提取。
 */

// ── 入站：下载媒体 ──────────────────────────────────────

/**
 * 下载媒体资源，返回 Buffer。
 * 只接受 http:// / https:// / data: 协议。
 */
export async function downloadMedia(url) {
  if (url.startsWith("data:")) {
    const comma = url.indexOf(",");
    if (comma === -1) throw new Error("invalid data URI");
    return Buffer.from(url.slice(comma + 1), "base64");
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`download failed: ${resp.status} ${resp.statusText}`);
    return Buffer.from(await resp.arrayBuffer());
  }
  throw new Error(`unsupported protocol: ${url.slice(0, 20)}`);
}

/**
 * Buffer → base64 字符串（不含 data: 前缀）
 */
export function bufferToBase64(buffer) {
  return buffer.toString("base64");
}

// ── MIME 检测（magic bytes）─────────────────────────────

const MAGIC_TABLE = [
  { bytes: [0xFF, 0xD8, 0xFF],                         mime: "image/jpeg" },
  { bytes: [0x89, 0x50, 0x4E, 0x47],                   mime: "image/png" },
  { bytes: [0x47, 0x49, 0x46, 0x38],                   mime: "image/gif" },
  { bytes: [0x52, 0x49, 0x46, 0x46],                   mime: "image/webp", offset: 8, extra: [0x57, 0x45, 0x42, 0x50] },
  { bytes: [0x25, 0x50, 0x44, 0x46],                   mime: "application/pdf" },
  { bytes: [0x49, 0x44, 0x33],                         mime: "audio/mpeg" },
  { bytes: [0x4F, 0x67, 0x67, 0x53],                   mime: "audio/ogg" },
  { bytes: [0x00, 0x00, 0x00],                         mime: "video/mp4", minLen: 8, check: (b) => b.length >= 8 && (b.toString("ascii", 4, 8) === "ftyp") },
];

/**
 * 检测 Buffer 的真实 MIME（magic bytes 优先）。
 * 检测不出时返回 fallback 或 "application/octet-stream"。
 */
export function detectMime(buffer, fallback) {
  for (const entry of MAGIC_TABLE) {
    if (buffer.length < entry.bytes.length) continue;
    const match = entry.bytes.every((b, i) => buffer[i] === b);
    if (!match) continue;
    if (entry.extra) {
      const off = entry.offset || 0;
      if (buffer.length < off + entry.extra.length) continue;
      if (!entry.extra.every((b, i) => buffer[off + i] === b)) continue;
    }
    if (entry.check && !entry.check(buffer)) continue;
    return entry.mime;
  }
  return fallback || "application/octet-stream";
}

// ── 出站：从 LLM 回复中提取媒体 ────────────────────────

const MEDIA_LINE_RE = /^MEDIA:\s*<?([^\s<>]+)>?\s*$/;
const IMG_MD_RE = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/;

/**
 * 对标 OpenClaw splitMediaFromOutput()
 *
 * 提取规则（按优先级）：
 * 1. MEDIA:<url> 指令行（主协议，不区分媒体类型）
 * 2. ![alt](url) markdown 图片（弱 fallback）
 *
 * 安全规则：
 * - 不从 fenced code block 内提取
 * - 无效 URL 静默丢弃
 *
 * @param {string} text
 * @returns {{ text: string, mediaUrls: string[] }}
 */
export function splitMediaFromOutput(text) {
  const mediaUrls = [];
  const outputLines = [];
  let inFence = false;

  for (const line of text.split("\n")) {
    // 追踪 code fence 状态
    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
      outputLines.push(line);
      continue;
    }

    if (inFence) {
      outputLines.push(line);
      continue;
    }

    // 1. MEDIA:<url> 指令行
    const mediaMatch = MEDIA_LINE_RE.exec(line.trim());
    if (mediaMatch) {
      const url = mediaMatch[1];
      if (isValidMediaUrl(url)) {
        mediaUrls.push(url);
      }
      // 无论是否有效都从输出中移除（不泄漏）
      continue;
    }

    // 2. ![alt](url) markdown 图片（弱 fallback，只从独立行提取）
    const imgMatch = IMG_MD_RE.exec(line);
    if (imgMatch && line.trim() === imgMatch[0]) {
      // 整行就是一个图片标记
      if (isValidMediaUrl(imgMatch[1])) {
        mediaUrls.push(imgMatch[1]);
      }
      continue;
    }

    outputLines.push(line);
  }

  return {
    text: outputLines.join("\n").trim(),
    mediaUrls,
  };
}

function isValidMediaUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// ── 工具函数 ────────────────────────────────────────────

/**
 * Readable stream → Buffer
 */
export async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * 格式化文件大小
 */
export function formatSize(bytes) {
  if (!bytes || bytes < 0) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
