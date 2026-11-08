import * as SecureStore from 'expo-secure-store';

const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

const keyOf = (accountId: string) => `account-secret-${accountId}`;

export function saveSecret(accountId: string, secret: string): Promise<void> {
  return SecureStore.setItemAsync(keyOf(accountId), secret, OPTIONS);
}

export function readSecret(accountId: string): Promise<string | null> {
  return SecureStore.getItemAsync(keyOf(accountId), OPTIONS);
}

export function deleteSecret(accountId: string): Promise<void> {
  return SecureStore.deleteItemAsync(keyOf(accountId), OPTIONS);
}
