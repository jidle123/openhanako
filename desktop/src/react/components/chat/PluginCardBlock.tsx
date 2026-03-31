import { useRef, useEffect, useState } from 'react';
import { hanaUrl } from '../../hooks/use-hana-fetch';
import type { PluginCardDetails } from '../../types';
import s from './PluginCardBlock.module.css';

interface Props { card: PluginCardDetails; }

export function PluginCardBlock({ card }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  // V2: type dispatch — only iframe for now, unknown types show description
  const isIframe = !card.type || card.type === 'iframe';

  const src = (() => {
    if (!isIframe) return '';
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
    if (!isIframe) return;
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
  }, [isIframe]);

  // Degradation: unknown type or error → show description
  if (!isIframe || error) {
    return (
      <div className={s.container}>
        {card.title && <div className={s.title}>{card.title}</div>}
        <div className={s.description}>{card.description}</div>
      </div>
    );
  }

  return (
    <div className={s.container}>
      {card.title && <div className={s.title}>{card.title}</div>}
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
