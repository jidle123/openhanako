// desktop/src/react/utils/screenshot.ts
import html2canvas from 'html2canvas';
import { useStore } from '../stores';
import { selectSelectedIdsBySession } from '../stores/session-selectors';

/**
 * 截图指定消息并保存到文件。
 *
 * @param targetMessageId - 触发截图的消息 ID（无勾选时用这个）
 * @param sessionPath - 消息所属 session，用显式归属避免依赖全局焦点
 */
export async function takeScreenshot(targetMessageId: string, sessionPath: string): Promise<void> {
  const state = useStore.getState();
  const ids = selectSelectedIdsBySession(state, sessionPath);
  const messageIds = ids.length > 0 ? ids : [targetMessageId];

  // 1. 收集 DOM 节点（按文档顺序）
  const nodes: HTMLElement[] = [];
  for (const id of messageIds) {
    const el = document.querySelector(`[data-message-id="${id}"]`) as HTMLElement | null;
    if (el) nodes.push(el);
  }
  // 按 DOM 顺序排序
  nodes.sort((a, b) => {
    const pos = a.compareDocumentPosition(b);
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  if (nodes.length === 0) return;

  // 2. 判断是否混合角色（决定是否显示头像）
  const roles = new Set<string>();
  const session = state.chatSessions[sessionPath];
  if (session) {
    for (const item of session.items) {
      if (item.type !== 'message') continue;
      if (messageIds.includes(item.data.id)) roles.add(item.data.role);
    }
  }
  const isMixed = roles.size > 1;

  // 3. 构建离屏容器（挂在 body 下，继承 html[data-theme] 的 CSS 变量级联）
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-9999px;top:0;width:640px;padding:24px;background:var(--bg);z-index:-1;';
  // 复制当前主题属性以确保 CSS 变量生效
  const themeAttr = document.documentElement.getAttribute('data-theme');
  if (themeAttr) container.setAttribute('data-theme', themeAttr);

  for (const node of nodes) {
    const clone = node.cloneNode(true) as HTMLElement;
    // 如果不是混合对话，移除头像行
    if (!isMixed) {
      const avatarRow = clone.querySelector('[class*="avatarRow"]');
      if (avatarRow) avatarRow.remove();
    }
    // 移除操作按钮
    const actions = clone.querySelector('[class*="msgActions"]');
    if (actions) actions.remove();
    container.appendChild(clone);
  }

  // 4. 添加水印（用 <img> 加载本地 avatar，圆形裁切）
  // logo 路径用绝对 file:// URL 确保 html2canvas 能加载
  const watermark = document.createElement('div');
  watermark.style.cssText = 'display:flex;align-items:center;justify-content:flex-end;gap:6px;padding:12px 0 0;opacity:0.15;font-size:0.75rem;color:var(--hana-text-muted,#999);';

  const logoImg = document.createElement('img');
  // 用和 AssistantMessage 相同的路径取 avatar，确保 Electron 能解析
  const baseUrl = document.baseURI.replace(/\/[^/]*$/, '/');
  logoImg.src = `${baseUrl}assets/Hanako.png`;
  logoImg.crossOrigin = 'anonymous';
  logoImg.style.cssText = 'width:20px;height:20px;border-radius:50%;object-fit:cover;';
  watermark.appendChild(logoImg);

  const label = document.createElement('span');
  label.textContent = 'OpenHanako';
  label.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  watermark.appendChild(label);

  container.appendChild(watermark);

  // 5. 挂载并截图
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      backgroundColor: null,
      useCORS: true,
      allowTaint: true,
      scale: 2, // Retina
    });

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('canvas.toBlob returned null');

    // 6. 转 base64（用 FileReader 避免大文件的字符串拼接开销）
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });

    // 7. 保存文件
    const homeFolder = state.homeFolder;
    const t = window.t ?? ((p: string) => p);
    let dir: string;
    if (homeFolder) {
      dir = `${homeFolder}/截图`;
    } else {
      // fallback: homeFolder 未配置时保存到桌面
      dir = '~/Desktop/截图';
    }

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const fileName = `hanako-${timestamp}.png`;
    const filePath = `${dir}/${fileName}`;

    const hana = (window as any).hana;
    if (!hana?.writeFileBinary) {
      state.addToast(t('common.screenshotFailed'), 'error');
      return;
    }

    const ok = await hana.writeFileBinary(filePath, base64);
    if (ok) {
      state.addToast(t('common.screenshotSaved').replace('{path}', filePath), 'success', 4000);
    } else {
      state.addToast(t('common.screenshotFailed'), 'error');
    }
  } catch (err) {
    console.error('[screenshot]', err);
    const t = window.t ?? ((p: string) => p);
    state.addToast(t('common.screenshotFailed'), 'error');
  } finally {
    container.remove();
  }
}
