import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');

function read(relPath: string) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

describe('chat message session ownership', () => {
  it('消息组件不再从 currentSessionPath 倒推自己的 session', () => {
    const assistantSource = read('components/chat/AssistantMessage.tsx');
    const userSource = read('components/chat/UserMessage.tsx');

    expect(assistantSource).not.toMatch(/currentSessionPath/);
    expect(userSource).not.toMatch(/currentSessionPath/);
  });

  it('ChatArea 把显式 sessionPath 传给消息组件', () => {
    const chatAreaSource = read('components/chat/ChatArea.tsx');

    expect(chatAreaSource).toMatch(/<UserMessage[\s\S]*sessionPath=\{sessionPath\}/);
    expect(chatAreaSource).toMatch(/<AssistantMessage[\s\S]*sessionPath=\{sessionPath\}/);
  });

  it('聊天消息 selector 不再为缺失 key 内联返回新空数组', () => {
    const assistantSource = read('components/chat/AssistantMessage.tsx');
    const userSource = read('components/chat/UserMessage.tsx');
    const actionsSource = read('components/chat/MessageActions.tsx');

    expect(assistantSource).not.toMatch(/selectedIdsBySession\[[^\]]+\]\s*\|\|\s*\[\]/);
    expect(userSource).not.toMatch(/selectedIdsBySession\[[^\]]+\]\s*\|\|\s*\[\]/);
    expect(actionsSource).not.toMatch(/selectedIdsBySession\[[^\]]+\]\s*\|\|\s*\[\]/);
  });
});
