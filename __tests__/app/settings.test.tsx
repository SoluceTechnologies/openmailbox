import { fireEvent, screen } from '@testing-library/react-native';

import SettingsScreen from '../../app/settings/index';
import { queryClient, queryKeys } from '@/core/queryClient';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSyncStore } from '@/stores/syncStore';
import i18n from '@/utils/i18n';

import { makeAccount } from '../helpers/fixtures';
import { renderWithProviders } from '../helpers/render';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useRouter: () => mockRouter }));

describe('settings', () => {
  beforeAll(() => i18n.changeLanguage('en'));

  beforeEach(() => {
    jest.clearAllMocks();
    useSettingsStore.setState({ language: 'en', loadRemoteImages: false });
    useSyncStore.setState({ statuses: {}, authRequired: {} });
    queryClient.setQueryData(queryKeys.accounts, [
      makeAccount(),
      makeAccount({ id: 'account-2', email: 'bob@example.com', displayName: 'bob@example.com' }),
    ]);
  });

  it('lists accounts without repeating an address used as the name', () => {
    renderWithProviders(<SettingsScreen />);
    expect(screen.getByText('Alice Martin')).toBeOnTheScreen();
    expect(screen.getByText('alice@example.com')).toBeOnTheScreen();
    expect(screen.getAllByText('bob@example.com')).toHaveLength(1);
  });

  it('opens an account and the add account flow', () => {
    renderWithProviders(<SettingsScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Alice Martin' }));
    fireEvent.press(screen.getByRole('button', { name: 'Add Account' }));
    expect(mockRouter.push.mock.calls).toEqual([['/settings/account/account-1'], ['/accounts/add']]);
  });

  it('blocks remote images until switched on', () => {
    renderWithProviders(<SettingsScreen />);
    const toggle = screen.getByRole('switch');
    expect(toggle).not.toBeChecked();
    fireEvent(toggle, 'valueChange', true);
    expect(useSettingsStore.getState().loadRemoteImages).toBe(true);
  });

  it('shows the current language next to Appearance', () => {
    useSettingsStore.setState({ language: 'nl' });
    renderWithProviders(<SettingsScreen />);
    expect(screen.getByText('Nederlands')).toBeOnTheScreen();
  });
});
