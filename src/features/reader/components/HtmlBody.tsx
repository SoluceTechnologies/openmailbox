import { memo, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { confirmOpenLink } from '../openLink';
import { documentFor, PAGE } from '../readerPage';

const INITIAL_HEIGHT = 120;
const BROKEN_IMAGE_MESSAGE = 'broken-image:';
const MAX_REFETCHED_IMAGE_BYTES = 5 * 1024 * 1024;

export const ADAPT_COLOR = `
function adaptColor(color, background) {
  if (color.indexOf('rgb') !== 0) return null;
  var channels = color.match(/[\\d.]+/g);
  var alpha = channels.length > 3 ? Number(channels[3]) : 1;
  if (alpha === 0) return null;
  var r = channels[0] / 255, g = channels[1] / 255, b = channels[2] / 255;
  var luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (background !== (luma > 0.5)) return null;
  var max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min, sum = max + min;
  var hue = 0, saturation = 0;
  if (delta) {
    saturation = delta / (sum > 1 ? 2 - sum : sum);
    hue = max === r ? (g - b) / delta + (g < b ? 6 : 0) : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  }
  var lightness = background ? 0.11 + (1 - luma) * 0.48 : 0.95 - luma * 0.7;
  return 'hsla(' + Math.round(hue * 60) + ', ' + Math.round(saturation * 100) + '%, ' + Math.round(lightness * 100) + '%, ' + alpha + ')';
}
`;

const fitAndMeasure = (availableWidth: number, dark: boolean, scaleViewport: boolean) => `
(function () {
  ${ADAPT_COLOR}
  function apply(changes) {
    changes.forEach(function (change) {
      if (change[2]) change[0].style.setProperty(change[1], change[2], 'important');
    });
  }
  function darken() {
    var changes = [];
    Array.prototype.forEach.call(document.querySelectorAll('body, body *'), function (element) {
      var style = getComputedStyle(element);
      changes.push([element, 'color', adaptColor(style.color, false)]);
      changes.push([element, 'background-color', adaptColor(style.backgroundColor, true)]);
      ['top', 'right', 'bottom', 'left'].forEach(function (side) {
        if (parseFloat(style.getPropertyValue('border-' + side + '-width'))) {
          changes.push([element, 'border-' + side + '-color', adaptColor(style.getPropertyValue('border-' + side + '-color'), true)]);
        }
      });
    });
    apply(changes);
  }
  if (${dark}) darken();
  function reportBrokenImage(image) {
    if (image.dataset.reported || !/^https?:/i.test(image.src)) return;
    image.dataset.reported = '1';
    window.ReactNativeWebView.postMessage('${BROKEN_IMAGE_MESSAGE}' + image.src);
  }
  Array.prototype.forEach.call(document.images, function (image) {
    if (image.complete && image.naturalWidth === 0) reportBrokenImage(image);
    else image.addEventListener('error', function () { reportBrokenImage(image); });
  });
  var viewport = document.querySelector('meta[name=viewport]');
  var layoutWidth = ${availableWidth};
  function fit() {
    var body = document.body;
    if (!body) return;
    if (!${scaleViewport}) {
      body.style.zoom = '1';
      var overflow = body.scrollWidth / ${availableWidth};
      body.style.zoom = String(overflow > 1.02 ? 1 / overflow : 1);
      return;
    }
    var width = Math.max(document.documentElement.scrollWidth, body.scrollWidth);
    if (width <= layoutWidth * 1.02) return;
    layoutWidth = width;
    viewport.setAttribute('content', 'width=' + width);
  }
  function report() {
    fit();
    var height = Math.ceil((document.documentElement.getBoundingClientRect().height * ${availableWidth}) / layoutWidth);
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

interface HtmlBodyProps {
  html: string;
  allowRemoteContent: boolean;
  background?: string;
}

function HtmlBodyImpl({ html, allowRemoteContent, background }: HtmlBodyProps) {
  const { t } = useTranslation();
  const { dark } = useTheme();
  const base = dark ? PAGE.dark : PAGE.light;
  const page = useMemo(() => (background ? { ...base, background } : base), [base, background]);
  const [height, setHeight] = useState(INITIAL_HEIGHT);
  const [width, setWidth] = useState(0);
  const webViewRef = useRef<ComponentRef<typeof WebView>>(null);
  const source = useMemo(() => ({ html: documentFor(html, allowRemoteContent, page) }), [html, allowRemoteContent, page]);

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
    if (request.isTopFrame === false) return false;
    confirmOpenLink(request.url, t);
    return false;
  };

  const onLayout = (event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width));

  return (
    <View style={[styles.container, { height, backgroundColor: page.background }]} onLayout={onLayout}>
      {width > 0 ? (
        <WebView
          ref={webViewRef}
          key={`${width}-${dark}`}
          source={source}
          originWhitelist={['*']}
          injectedJavaScript={fitAndMeasure(width, dark, Platform.OS === 'ios')}
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
          style={[styles.webView, { backgroundColor: page.background }]}
        />
      ) : null}
    </View>
  );
}

export const HtmlBody = memo(HtmlBodyImpl);

const styles = StyleSheet.create({
  container: { width: '100%', borderRadius: 10, overflow: 'hidden' },
  webView: { flex: 1 },
});
