import { BackHandler } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import * as WebBrowser from 'expo-web-browser';
import { Authentication, CoreError, Security } from '@openmailbox/mail-core';

import OnboardingScreen from '../../app/onboarding';
import i18n from '@/utils/i18n';

import { core, makeAccount } from '../helpers/fixtures';
import { renderWithProviders } from '../helpers/render';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useRouter: () => mockRouter, router: { back: () => mockRouter.back(), replace: (href: string) => mockRouter.replace(href), canGoBack: () => true } }));

describe('onboarding', () => {
  beforeAll(() => i18n.changeLanguage('en'));
  beforeEach(() => jest.clearAllMocks());

  it('welcomes the user with the list of providers', () => {
    renderWithProviders(<OnboardingScreen />);
    expect(screen.getByText('Welcome to Open Mailbox')).toBeOnTheScreen();
    for (const name of ['Google', 'Microsoft', 'iCloud', 'OVHcloud', 'IONOS', 'Yahoo', 'Other']) {
      expect(screen.getByRole('button', { name })).toBeOnTheScreen();
    }
    for (const hint of [
      'Gmail, Google Workspace',
      'Outlook, Hotmail, Live, Microsoft 365',
      'icloud.com, me.com, mac.com',
      'MX Plan, Email Pro, Exchange, Zimbra',
    ]) {
      expect(screen.getByText(hint)).toBeOnTheScreen();
    }
    expect(screen.getByRole('button', { name: 'Language' })).toBeOnTheScreen();
  });

  it('signs in to a provider and opens the mailboxes', async () => {
    core.discover.mockResolvedValue({
      imap: { host: 'imap.gmail.com', port: 993, security: Security.Tls },
      smtp: { host: 'smtp.gmail.com', port: 465, security: Security.Tls },
      username: 'alice@gmail.com',
    });
    core.addAccount.mockResolvedValue(makeAccount({ email: 'alice@gmail.com' }));
    renderWithProviders(<OnboardingScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Google' }));
    expect(screen.getByText('Google Account')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Use an app password instead'));
    expect(screen.getByText('Google only accepts app passwords from mail apps.')).toBeOnTheScreen();

    fireEvent.changeText(screen.getByLabelText('Name'), 'Alice Martin');
    fireEvent.changeText(screen.getByLabelText('Email'), 'alice@gmail.com');
    fireEvent.changeText(screen.getByLabelText('Password'), 'abcd efgh ijkl mnop');
    fireEvent.press(screen.getByText('Sign In'));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
    expect(core.addAccount.mock.calls[0][0]).toMatchObject({ email: 'alice@gmail.com', displayName: 'Alice Martin' });
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('signs in to Microsoft straight from the list, showing progress on its row', async () => {
    core.beginSignIn.mockReturnValue({ url: 'https://login.microsoftonline.com/authorize', redirectUri: 'openmailbox://oauth' });
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'success', url: 'openmailbox://oauth?code=c' });
    let finish: (account: ReturnType<typeof makeAccount>) => void = () => undefined;
    core.addOauthAccount.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderWithProviders(<OnboardingScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Microsoft' }));

    await waitFor(() => expect(core.addOauthAccount).toHaveBeenCalledWith('openmailbox://oauth?code=c', ''));
    expect(screen.queryByText('Microsoft Account')).toBeNull();
    expect(screen.getByLabelText('Microsoft')).toHaveProp('accessibilityState', expect.objectContaining({ busy: true }));
    await act(async () => finish(makeAccount({ email: 'alice@outlook.com', authentication: Authentication.Microsoft })));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
  });

  it('shows why Microsoft sign-in failed above the providers', async () => {
    core.beginSignIn.mockReturnValue({ url: 'https://login.microsoftonline.com/authorize', redirectUri: 'openmailbox://oauth' });
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'success', url: 'openmailbox://oauth?code=c' });
    core.addOauthAccount.mockRejectedValue(new CoreError.Server({ message: 'outlook.office365.com refused the sign-in of alice@outlook.com' }));
    renderWithProviders(<OnboardingScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Microsoft' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/refused the sign-in of alice@outlook.com/);
    expect(screen.getByRole('button', { name: 'Google' })).toBeOnTheScreen();
  });

  it('offers Google sign-in first and the app password on request', () => {
    renderWithProviders(<OnboardingScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Google' }));
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeOnTheScreen();
    expect(screen.queryByLabelText('Password')).toBeNull();

    fireEvent.press(screen.getByText('Use an app password instead'));

    expect(screen.getByLabelText('Password')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).toBeNull();
  });

  it('signs in to a provider it knows without looking up its servers', async () => {
    core.addAccount.mockResolvedValue(makeAccount({ email: 'alice@ionos.example' }));
    renderWithProviders(<OnboardingScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'IONOS' }));
    fireEvent.changeText(screen.getByLabelText('Email'), 'alice@ionos.example');
    fireEvent.changeText(screen.getByLabelText('Password'), 'secret');
    fireEvent.press(screen.getByText('Sign In'));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
    expect(core.discover).not.toHaveBeenCalled();
    expect(core.addAccount.mock.calls[0][0].imap.host).toBe('imap.ionos.fr');
  });

  it('hints the outgoing server with an SMTP name when servers are set by hand', () => {
    renderWithProviders(<OnboardingScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Other' }));
    fireEvent.press(screen.getByText('Configure Servers Manually'));
    expect(screen.getByPlaceholderText('imap.example.com')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('smtp.example.com')).toBeOnTheScreen();
  });

  it('asks for the incoming username, then suggests the address', async () => {
    renderWithProviders(<OnboardingScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Other' }));
    fireEvent.press(screen.getByText('Configure Servers Manually'));
    expect(await screen.findByLabelText('Username')).toHaveProp('placeholder', 'Required');

    fireEvent.changeText(screen.getByLabelText('Email'), 'jane@example.org');
    expect(screen.getByLabelText('Username')).toHaveProp('placeholder', 'jane@example.org');
  });

  it('asks which OVHcloud offer the account is on before the form', () => {
    renderWithProviders(<OnboardingScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'OVHcloud' }));
    for (const name of ['MX Plan', 'Email Pro', 'Hosted Exchange', 'Zimbra']) {
      expect(screen.getByRole('button', { name })).toBeOnTheScreen();
    }

    fireEvent.press(screen.getByRole('button', { name: 'Email Pro' }));
    expect(screen.getByText('INCOMING MAIL (IMAP)')).toBeOnTheScreen();
    expect(screen.getAllByLabelText('Port').map((field) => field.props.value)).toEqual(['993', '587']);

    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: 'Zimbra' })).toBeOnTheScreen();
  });

  it('offers to sign in on the server page when the mail server supports it', async () => {
    core.discover.mockResolvedValue({
      imap: { host: 'mail.example.org', port: 993, security: Security.Tls },
      smtp: { host: 'mail.example.org', port: 465, security: Security.Tls },
      username: 'alice@example.org',
    });
    core.probeOauth.mockResolvedValue('https://mail.example.org');
    renderWithProviders(<OnboardingScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Other' }));
    fireEvent.changeText(screen.getByLabelText('Email'), 'alice@example.org');

    expect(await screen.findByRole('button', { name: 'Sign in with mail.example.org' }, { timeout: 3000 })).toBeOnTheScreen();
    expect(core.probeOauth).toHaveBeenCalledWith('alice@example.org', { host: 'mail.example.org', port: 993, security: Security.Tls });
    expect(screen.queryByLabelText('Password')).toBeNull();

    fireEvent.press(screen.getByText('Use a password instead'));
    expect(screen.getByLabelText('Password')).toBeOnTheScreen();
  });

  it('keeps the server sign-in on screen while the address is edited and checked again', async () => {
    core.discover.mockResolvedValue({
      imap: { host: 'mail.example.org', port: 993, security: Security.Tls },
      smtp: { host: 'mail.example.org', port: 465, security: Security.Tls },
      username: 'alice@example.org',
    });
    core.probeOauth.mockResolvedValue('https://mail.example.org');
    renderWithProviders(<OnboardingScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Other' }));
    fireEvent.changeText(screen.getByLabelText('Email'), 'alice@example.org');
    await screen.findByRole('button', { name: 'Sign in with mail.example.org' }, { timeout: 3000 });

    fireEvent.changeText(screen.getByLabelText('Email'), 'bob@');
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign in with mail.example.org' })).toBeDisabled();

    fireEvent.changeText(screen.getByLabelText('Email'), 'bob@example.org');
    expect(screen.getByRole('button', { name: 'Sign in with mail.example.org' })).toBeDisabled();
    await waitFor(() => expect(core.probeOauth).toHaveBeenCalledWith('bob@example.org', expect.anything()), { timeout: 3000 });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in with mail.example.org' })).toBeEnabled());
    expect(screen.queryByLabelText('Password')).toBeNull();
  });

  it('keeps the password form when the mail server has no OAuth', async () => {
    core.discover.mockResolvedValue({
      imap: { host: 'imap.example.net', port: 993, security: Security.Tls },
      smtp: { host: 'smtp.example.net', port: 465, security: Security.Tls },
      username: 'alice@example.net',
    });
    core.probeOauth.mockResolvedValue(undefined);
    renderWithProviders(<OnboardingScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Other' }));
    fireEvent.changeText(screen.getByLabelText('Email'), 'alice@example.net');

    await waitFor(() => expect(core.probeOauth).toHaveBeenCalled(), { timeout: 3000 });
    expect(screen.getByLabelText('Password')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Sign in with/ })).toBeNull();
  });

  it('says when the account is already added', async () => {
    core.addAccount.mockRejectedValue(new CoreError.AccountExists());
    renderWithProviders(<OnboardingScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'IONOS' }));
    fireEvent.changeText(screen.getByLabelText('Email'), 'alice@ionos.example');
    fireEvent.changeText(screen.getByLabelText('Password'), 'secret');
    fireEvent.press(screen.getByText('Sign In'));

    expect(await screen.findByRole('alert')).toHaveTextContent('This account is already added.');
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('shows why signing in failed next to the form', async () => {
    core.discover.mockRejectedValue(new Error('offline'));
    renderWithProviders(<OnboardingScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Other' }));
    fireEvent.changeText(screen.getByLabelText('Email'), 'alice@example.org');
    fireEvent.changeText(screen.getByLabelText('Password'), 'secret');
    fireEvent.press(screen.getByText('Sign In'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.');
    expect(screen.getByText('INCOMING MAIL (IMAP)')).toBeOnTheScreen();
  });

  it('goes back to the providers with the back button and the system back gesture', () => {
    const addListener = jest.spyOn(BackHandler, 'addEventListener');
    renderWithProviders(<OnboardingScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Yahoo' }));
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Welcome to Open Mailbox')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Yahoo' }));
    const handler = addListener.mock.calls.at(-1)![1];
    act(() => void handler(undefined as never));
    expect(screen.getByText('Welcome to Open Mailbox')).toBeOnTheScreen();
  });
});
