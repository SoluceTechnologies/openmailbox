import type { TFunction } from 'i18next';

export function formatSize(bytes: number, t: TFunction): string {
  if (bytes < 1024) return t('units.bytes', { value: bytes });
  if (bytes < 1024 * 1024) return t('units.kilobytes', { value: Math.round(bytes / 1024) });
  return t('units.megabytes', { value: (bytes / (1024 * 1024)).toFixed(1) });
}
