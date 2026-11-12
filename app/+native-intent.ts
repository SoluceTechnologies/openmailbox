export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return path.includes('expo-sharing') ? '/compose?shared=1' : path;
}
