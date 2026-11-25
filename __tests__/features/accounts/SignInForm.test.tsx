import { fireEvent, screen } from '@testing-library/react-native';

import { SignInForm } from '@/features/accounts/components/SignInForm';
import { PROVIDERS } from '@/features/accounts/providers';
import i18n from '@/utils/i18n';

import { renderWithProviders } from '../../helpers/render';

jest.mock('expo-router', () => {
  const { createElement } = jest.requireActual('react');
  const { Pressable, Text } = jest.requireActual('react-native');
  const actual = jest.requireActual('expo-router');
  const Toolbar = ({ children }: { children: unknown }) => children;
  Toolbar.Button = ({ children, disabled, onPress }: { children: string; disabled?: boolean; onPress: () => void }) =>
    createElement(Pressable, { testID: 'toolbar', accessibilityRole: 'button', disabled, onPress }, createElement(Text, null, children));
  return { ...actual, Stack: { ...actual.Stack, Toolbar } };
});

const yahoo = PROVIDERS.find((provider) => provider.identifier === 'yahoo')!;

describe('SignInForm', () => {
  beforeAll(() => i18n.changeLanguage('en'));

  it('moves Sign In to the navigation bar with native chrome', () => {
    renderWithProviders(<SignInForm provider={yahoo} nativeChrome onDone={jest.fn()} />);
    const [signIn, ...others] = screen.getAllByRole('button', { name: 'Sign In' });
    expect(others).toHaveLength(0);
    expect(signIn.props.testID).toBe('toolbar');
    expect(signIn).toBeDisabled();
    fireEvent.changeText(screen.getByLabelText('Email'), 'alice@yahoo.com');
    fireEvent.changeText(screen.getByLabelText('Password'), 'app-password');
    expect(signIn).toBeEnabled();
  });
});
