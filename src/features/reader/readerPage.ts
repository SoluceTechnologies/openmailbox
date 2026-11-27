export const READER_FONT = "-apple-system, Roboto, 'Helvetica Neue', sans-serif";

export const PAGE = {
  light: { background: '#ffffff', text: '#1a1a1a', quote: '#555555', rule: '#d0d0d0', link: '#0b6bcb' },
  dark: { background: '#1c1c1e', text: '#f1f1f1', quote: '#aaaaaa', rule: '#48484a', link: '#4ea5ff' },
};

export function documentFor(html: string, allowRemoteContent: boolean, page: (typeof PAGE)['light']): string {
  const images = allowRemoteContent ? 'data: https: http:' : 'data:';
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src ${images}; font-src data:; media-src 'none'; frame-src 'none'; form-action 'none';">
<style>
html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
html, body { margin: 0; padding: 0; background: ${page.background}; color: ${page.text}; }
:root, :root > body { height: auto !important; min-height: 0 !important; max-height: none !important; }
a { color: ${page.link}; }
body { padding: 4px 2px; font: 15px/1.45 ${READER_FONT}; overflow-wrap: break-word; }
img { max-width: 100%; height: auto; }
pre { white-space: pre-wrap; }
blockquote { margin: 0 0 0 8px; padding-left: 10px; border-left: 3px solid ${page.rule}; color: ${page.quote}; }
</style></head><body>${html}</body></html>`;
}
