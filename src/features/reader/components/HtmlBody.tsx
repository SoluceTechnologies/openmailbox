import { memo, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Alert, Linking, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import { useTranslation } from 'react-i18next';

const INITIAL_HEIGHT = 120;
const BROKEN_IMAGE_MESSAGE = 'broken-image:';
const MAX_REFETCHED_IMAGE_BYTES = 5 * 1024 * 1024;

const fitAndMeasure = (availableWidth: number) => `
(function () {
  function reportBrokenImage(image) {
    if (image.dataset.reported || !/^https?:/i.test(image.src)) return;
    image.dataset.reported = '1';
    window.ReactNativeWebView.postMessage('${BROKEN_IMAGE_MESSAGE}' + image.src);
  }
  Array.prototype.forEach.call(document.images, function (image) {
    if (image.complete && image.naturalWidth === 0) reportBrokenImage(image);
    else image.addEventListener('error', function () { reportBrokenImage(image); });
  });
  function fit() {
    var body = document.body;
    if (!body) return;
    body.style.zoom = '1';
    var overflow = body.scrollWidth / ${availableWidth};
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

export async function fetchImageAsDataUri(url: string): Promise<string | null> {
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const response = await fetch(url, { credentials: 'omit' });
    if (!response.ok) return null;
    const image = await response.blob();
    if (!image.type.startsWith('image/') || image.size > MAX_REFETCHED_IMAGE_BYTES) return null;
    return await new Promise((resolve) => {
      const fileReader = new FileReader();
      fileReader.onload = () => resolve(typeof fileReader.result === 'string' ? fileReader.result : null);
      fileReader.onerror = () => resolve(null);
      fileReader.readAsDataURL(image);
    });
  } catch {
    return null;
  }
}

const replaceImageSource = (url: string, dataUri: string) => `
Array.prototype.forEach.call(document.images, function (image) {
  if (image.src === ${JSON.stringify(url)}) image.src = ${JSON.stringify(dataUri)};
});
true;
`;

function documentFor(html: string, allowRemoteContent: boolean): string {
  const images = allowRemoteContent ? 'data: https: http:' : 'data:';
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src ${images}; font-src data:; media-src 'none'; frame-src 'none'; form-action 'none';">
<style>
html, body { margin: 0; padding: 0; background: #ffffff; color: #1a1a1a; }
body { padding: 4px 2px; font: 15px/1.45 -apple-system, Roboto, 'Helvetica Neue', sans-serif; overflow-wrap: break-word; }
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
  const [width, setWidth] = useState(0);
  const webViewRef = useRef<ComponentRef<typeof WebView>>(null);
  const source = useMemo(() => ({ html: documentFor(html, allowRemoteContent) }), [html, allowRemoteContent]);

  const onMessage = (event: WebViewMessageEvent) => {
    const message = event.nativeEvent.data;
    if (message.startsWith(BROKEN_IMAGE_MESSAGE)) {
      if (!allowRemoteContent) return;
      const url = message.slice(BROKEN_IMAGE_MESSAGE.length);
      fetchImageAsDataUri(url).then((dataUri) => {
        if (dataUri) webViewRef.current?.injectJavaScript(replaceImageSource(url, dataUri));
      });
      return;
    }
    const measured = Number(message);
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

  const onLayout = (event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width));

  return (
    <View style={[styles.container, { height }]} onLayout={onLayout}>
      {width > 0 ? (
        <WebView
          ref={webViewRef}
          key={width}
          source={source}
          originWhitelist={['*']}
          injectedJavaScript={fitAndMeasure(width)}
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
          scalesPageToFit={false}
          setBuiltInZoomControls={false}
          style={styles.webView}
        />
      ) : null}
    </View>
  );
}

export const HtmlBody = memo(HtmlBodyImpl);

const styles = StyleSheet.create({
  container: { width: '100%', borderRadius: 10, overflow: 'hidden', backgroundColor: '#ffffff' },
  webView: { flex: 1, backgroundColor: '#ffffff' },
});
