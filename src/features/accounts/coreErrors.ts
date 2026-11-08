import { CoreError } from '@openmailbox/mail-core';
import type { TFunction } from 'i18next';

export function describeCoreError(error: unknown, t: TFunction): string {
  if (CoreError.Auth.instanceOf(error)) return t('errors.auth');
  if (CoreError.Network.instanceOf(error)) return t('errors.network', { message: error.inner.message });
  if (CoreError.Server.instanceOf(error)) return t('errors.server', { message: error.inner.message });
  if (CoreError.InvalidInput.instanceOf(error)) return t('errors.invalidInput', { message: error.inner.message });
  return t('errors.generic');
}
