import { BackHandler } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Security } from '@openmailbox/mail-core';

import OnboardingScreen from '../../app/onboarding';
import i18n from '@/utils/i18n';

import { core, makeAccount } from '../helpers/fixtures';
import { renderWithProviders } from '../helpers/render';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useRouter: () => mockRouter }));

describe('onboarding', () => {
  beforeAll(() => i18n.changeLanguage('en'));
  beforeEach(() => jest.clearAllMocks());

  it('welcomes the user with the list of providers', () => {
    renderWithProviders(<OnboardingScreen />);
    expect(screen.getByText('Welcome to OpenMailbox')).toBeOnTheScreen();
    for (const name of ['iCloud', 'Google', 'Yahoo', 'Fastmail', 'Other']) {
      expect(screen.getByRole('button', { name })).toBeOnTheScreen();
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
    expect(screen.getByText('Google only accepts app passwords from mail apps.')).toBeOnTheScreen();

    fireEvent.changeText(screen.getByLabelText('Name'), 'Alice Martin');
    fireEvent.changeText(screen.getByLabelText('Email'), 'alice@gmail.com');
    fireEvent.changeText(screen.getByLabelText('Password'), 'abcd efgh ijkl mnop');
    fireEvent.press(screen.getByText('Sign In'));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
    expect(core.addAccount.mock.calls[0][0]).toMatchObject({ email: 'alice@gmail.com', displayName: 'Alice Martin' });
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
    expect(screen.getByText('Welcome to OpenMailbox')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Yahoo' }));
    const handler = addListener.mock.calls.at(-1)![1];
    act(() => void handler(undefined as never));
    expect(screen.getByText('Welcome to OpenMailbox')).toBeOnTheScreen();
  });
});
