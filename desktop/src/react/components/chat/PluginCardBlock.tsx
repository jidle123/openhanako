import { useRef, useEffect, useState } from 'react';
import { hanaUrl } from '../../hooks/use-hana-fetch';
import { useStore } from '../../stores';
import type { PluginCardDetails } from '../../types';
import s from './PluginCardBlock.module.css';

interface Props { card: PluginCardDetails; }

export function PluginCardBlock({ card }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  // Check if the plugin is currently loaded
  const pluginPages = useStore(st => st.pluginPages);
  const pluginWidgets = useStore(st => st.pluginWidgets);
  const pluginInstalled = pluginPages.some(p => p.pluginId === card.pluginId)
    || pluginWidgets.some(w => w.pluginId === card.pluginId);

  const isIframe = !card.type || card.type === 'iframe';

  const src = (() => {
    if (!isIframe || !pluginInstalled) return '';
    const theme = document.documentElement.dataset.theme || 'warm-paper';
    const cssUrl = hanaUrl(`/api/plugins/theme.css?theme=${encodeURIComponent(theme)}`);
    const base = hanaUrl(`/api/plugins/${card.pluginId}${card.route}`);
    const sep = base.includes('?') ? '&' : '?';
    const params = new URLSearchParams();
    params.set('hana-theme', theme);
    params.set('hana-css', cssUrl);
    return `${base}${sep}${params}`;
  })();

  useEffect(() => {
    if (!isIframe || !pluginInstalled) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'ready') setReady(true);
      if (e.data?.type === 'resize-request' && typeof e.data.payload?.height === 'number') {
        const h = Math.max(100, Math.min(e.data.payload.height, 600));
        if (iframeRef.current) iframeRef.current.style.height = `${h}px`;
      }
    };
    window.addEventListener('message', onMessage);
    const timeout = setTimeout(() => setReady(true), 5000);
    return () => { window.removeEventListener('message', onMessage); clearTimeout(timeout); };
  }, [isIframe, pluginInstalled]);

  // Degradation: plugin not installed, unknown type, or error → show description
  if (!isIframe || !pluginInstalled || error) {
    if (!card.description) return null; // no description either → hide completely
    return (
      <div className={s.container}>
        {card.title && <div className={s.title}>{card.title}</div>}
        <div className={s.description}>{card.description}</div>
      </div>
    );
  }

  return (
    <div className={s.container}>
      <div className={s.iframeWrap}>
        <iframe
          ref={iframeRef}
          className={s.iframe}
          src={src}
          sandbox="allow-scripts"
          style={{ opacity: ready ? 1 : 0.3 }}
          onError={() => setError(true)}
        />
      </div>
    </div>
  );
}
