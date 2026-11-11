import { router } from 'expo-router';

export function goBack(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
