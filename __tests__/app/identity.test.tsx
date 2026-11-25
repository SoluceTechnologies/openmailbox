import { Alert } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';

import IdentityScreen from '../../app/settings/identity';
import { queryClient, queryKeys } from '@/core/queryClient';
import { useSignatureEditor } from '@/features/signatures/signatureEditorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import i18n from '@/utils/i18n';

import { makeAccount } from '../helpers/fixtures';
import { renderWithProviders } from '../helpers/render';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useRouter: () => mockRouter,
  router: { back: () => mockRouter.back(), replace: (href: string) => mockRouter.replace(href), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
}));

const support = { id: 'identity-1', name: 'Support', email: 'info@example.com', signature: { html: '', text: '' } };

describe('identity settings', () => {
  beforeAll(() => i18n.changeLanguage('en'));

  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { accountId: 'account-1' };
    useSettingsStore.setState({ identities: {} });
    queryClient.setQueryData(queryKeys.accounts, [makeAccount()]);
  });

  it('adds an identity with a trimmed address', () => {
    renderWithProviders(<IdentityScreen />);
    fireEvent.changeText(screen.getByLabelText('Sender Name'), 'Support');
    fireEvent.changeText(screen.getByLabelText('Email'), ' Info@Domain.com ');
    fireEvent.press(screen.getByRole('button', { name: 'Add Signature' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/signature');
    act(() => useSignatureEditor.getState().onDone!({ html: '<b>The support team</b>', text: 'The support team' }));
    expect(useSettingsStore.getState().identities).toEqual({});
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(useSettingsStore.getState().identities['account-1']).toEqual([
      {
        id: expect.any(String),
        name: 'Support',
        email: 'Info@Domain.com',
        signature: { html: '<b>The support team</b>', text: 'The support team' },
      },
    ]);
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('disables Save until an address is typed', () => {
    renderWithProviders(<IdentityScreen />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.changeText(screen.getByLabelText('Email'), 'info@example.com');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it("refuses an invalid address and the account's own one", () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    renderWithProviders(<IdentityScreen />);
    fireEvent.changeText(screen.getByLabelText('Email'), 'nope');
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(alert).toHaveBeenLastCalledWith(i18n.t('accounts.invalidIdentityEmail'));

    fireEvent.changeText(screen.getByLabelText('Email'), 'ALICE@example.com');
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(alert).toHaveBeenLastCalledWith(i18n.t('accounts.identityExists'));
    expect(useSettingsStore.getState().identities).toEqual({});
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('edits an identity without counting its own address as taken', () => {
    useSettingsStore.setState({ identities: { 'account-1': [support] } });
    mockParams = { accountId: 'account-1', identityId: 'identity-1' };
    renderWithProviders(<IdentityScreen />);
    fireEvent.changeText(screen.getByLabelText('Sender Name'), 'Help Desk');
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(useSettingsStore.getState().identities['account-1']).toEqual([{ ...support, name: 'Help Desk' }]);
  });

  it('deletes an identity once confirmed', () => {
    useSettingsStore.setState({ identities: { 'account-1': [support] } });
    mockParams = { accountId: 'account-1', identityId: 'identity-1' };
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    renderWithProviders(<IdentityScreen />);
    fireEvent.press(screen.getByText('Delete Identity'));
    const buttons = alert.mock.calls[0][2] ?? [];
    buttons.find((button) => button.style === 'destructive')?.onPress?.();
    expect(useSettingsStore.getState().identities).toEqual({});
    expect(mockRouter.back).toHaveBeenCalled();
  });
});
