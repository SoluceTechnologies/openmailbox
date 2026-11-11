import { router } from 'expo-router';

/** Back, or home when the screen was opened on its own (a link, a reload) and has nothing behind it. */
export function goBack(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
