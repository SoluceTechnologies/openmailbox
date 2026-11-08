import { memo, useMemo, useState } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import { useTranslation } from 'react-i18next';

const INITIAL_HEIGHT = 120;

const FIT_AND_MEASURE = `
(function () {
  function fit() {
    var body = document.body;
    if (!body) return;
    body.style.zoom = '1';
    var overflow = body.scrollWidth / window.innerWidth;
    if (overflow > 1.02) body.style.zoom = String(1 / overflow);
  }
  function report() {
    fit();
    var height = Math.ceil(document.documentElement.getBoundingClientRect().height);
    window.ReactNativeWebView.postMessage(String(height));
  }
  window.addEventListener('load', report);
  if (window.ResizeObserver) new ResizeObserver(report).observe(document.documentElement);
  report();
})();
true;
`;

function documentFor(html: string, allowRemoteContent: boolean): string {
  const images = allowRemoteContent ? 'data: https: http:' : 'data:';
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src ${images}; font-src data:; media-src 'none'; frame-src 'none'; form-action 'none';">
<style>
html, body { margin: 0; padding: 0; background: #ffffff; color: #1a1a1a; }
body { padding: 12px 14px; font: 15px/1.45 -apple-system, Roboto, 'Helvetica Neue', sans-serif; overflow-wrap: break-word; }
img { max-width: 100%; height: auto; }
pre { white-space: pre-wrap; }
blockquote { margin: 0 0 0 8px; padding-left: 10px; border-left: 3px solid #d0d0d0; color: #555555; }
</style></head><body>${html}</body></html>`;
}

interface HtmlBodyProps {
  html: string;
  allowRemoteContent: boolean;
}

function HtmlBodyImpl({ html, allowRemoteContent }: HtmlBodyProps) {
  const { t } = useTranslation();
  const [height, setHeight] = useState(INITIAL_HEIGHT);
  const source = useMemo(() => ({ html: documentFor(html, allowRemoteContent) }), [html, allowRemoteContent]);

  const onMessage = (event: WebViewMessageEvent) => {
    const measured = Number(event.nativeEvent.data);
    if (Number.isFinite(measured) && measured > 0) setHeight(measured);
  };

  const onShouldStartLoadWithRequest = (request: ShouldStartLoadRequest) => {
    if (request.url === 'about:blank' || request.url.startsWith('data:')) return true;
    if (!request.isTopFrame) return false;
    let target = request.url;
    try {
      target = new URL(request.url).host || request.url;
    } catch {}
    Alert.alert(t('reader.openLinkTitle'), target, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('reader.openLink'), onPress: () => Linking.openURL(request.url).catch(() => undefined) },
    ]);
    return false;
  };

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        source={source}
        originWhitelist={['*']}
        injectedJavaScript={FIT_AND_MEASURE}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        scrollEnabled={false}
        nestedScrollEnabled={false}
        allowFileAccess={false}
        allowsLinkPreview={false}
        javaScriptCanOpenWindowsAutomatically={false}
        setSupportMultipleWindows={false}
        cacheEnabled={false}
        incognito
        style={styles.webView}
      />
    </View>
  );
}

export const HtmlBody = memo(HtmlBodyImpl);

const styles = StyleSheet.create({
  container: { width: '100%', borderRadius: 12, overflow: 'hidden', backgroundColor: '#ffffff' },
  webView: { flex: 1, backgroundColor: '#ffffff' },
});
