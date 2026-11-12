import { storage } from '@/storage';
import { useSettingsStore } from '@/stores/settingsStore';

describe('settings store', () => {
  it('keeps remote images blocked until the user allows them', () => {
    expect(useSettingsStore.getState().loadRemoteImages).toBe(false);
  });

  it('persists preferences to storage', () => {
    useSettingsStore.getState().setThemePreference('dark');
    useSettingsStore.getState().setLanguage('oc');
    useSettingsStore.getState().setLoadRemoteImages(true);
    useSettingsStore.getState().setAccountName('account-1', 'Work');
    useSettingsStore.getState().toggleCollapsed('account-1');
    useSettingsStore.getState().markCategorySeen('updates', 2_000);
    useSettingsStore.getState().markCategorySeen('updates', 1_000);
    const saved = JSON.parse(storage.getString('settings-store') ?? '{}');
    expect(saved.state).toMatchObject({
      themePreference: 'dark',
      language: 'oc',
      loadRemoteImages: true,
      accountNames: { 'account-1': 'Work' },
      collapsedIds: ['account-1'],
      categorySeenAt: { updates: 2_000 },
    });
  });
});
