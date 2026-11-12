import type { Account } from '@openmailbox/mail-core';

export function accountName(account: Account, names: Record<string, string>): string {
  return names[account.id]?.trim() || account.email;
}
