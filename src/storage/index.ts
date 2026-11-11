import { createMMKV, type MMKV } from 'react-native-mmkv';

export const storage: MMKV = createMMKV();

export const zustandStorage = {
  getItem: (name: string): string | null => storage.getString(name) ?? null,
  setItem: (name: string, value: string): void => storage.set(name, value),
  removeItem: (name: string): void => {
    storage.remove(name);
  },
};
