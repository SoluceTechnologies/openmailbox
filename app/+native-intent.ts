import { MAILTO } from '@/features/composer/prefill';

const SIGN_IN_ANSWER = /^[\w.+-]+:\/\/?(oauth|oauth2redirect)\b/;

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
  if (SIGN_IN_ANSWER.test(path)) return initial ? '/' : '';
  if (MAILTO.test(path)) return `/compose?mailto=${encodeURIComponent(path)}`;
  return path.includes('expo-sharing') ? '/compose?shared=1' : path;
}
