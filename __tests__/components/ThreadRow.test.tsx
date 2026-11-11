import { fireEvent, screen } from '@testing-library/react-native';

import { ThreadRow } from '@/features/threads/components/ThreadRow';
import i18n from '@/utils/i18n';

import { makeEmail, makeThread, NOW } from '../helpers/fixtures';
import { renderWithProviders } from '../helpers/render';

describe('ThreadRow', () => {
  beforeAll(async () => {
    jest.useFakeTimers({ now: NOW });
    await i18n.changeLanguage('en');
  });

  afterAll(() => jest.useRealTimers());

  it('shows the sender, subject and preview of the latest message', () => {
    renderWithProviders(<ThreadRow thread={makeThread()} onOpen={jest.fn()} />);
    expect(screen.getByText('Claire Dubois')).toBeOnTheScreen();
    expect(screen.getByText('Lancement du projet Atlas')).toBeOnTheScreen();
    expect(screen.getByText("Voici l'ordre du jour de jeudi.")).toBeOnTheScreen();
  });

  it('reads out unread threads as such', () => {
    renderWithProviders(<ThreadRow thread={makeThread()} onOpen={jest.fn()} />);
    expect(screen.getByRole('button').props.accessibilityLabel).toMatch(/^Unread, Claire Dubois, Lancement du projet Atlas, /);
  });

  it('counts the messages of a conversation next to the sender', () => {
    renderWithProviders(<ThreadRow thread={makeThread({ messageCount: 3 })} onOpen={jest.fn()} />);
    expect(screen.getByText('3')).toBeOnTheScreen();
  });

  it('falls back to the address, then to placeholders, when headers are missing', () => {
    const latest = makeEmail({ from: [{ email: 'noreply@example.com' }], subject: undefined, preview: undefined });
    renderWithProviders(<ThreadRow thread={makeThread({ latest })} onOpen={jest.fn()} />);
    expect(screen.getByText('noreply@example.com')).toBeOnTheScreen();
    expect(screen.getByText(i18n.t('reader.noSubject'))).toBeOnTheScreen();
  });

  it('opens the thread it shows', () => {
    const thread = makeThread();
    const onOpen = jest.fn();
    renderWithProviders(<ThreadRow thread={thread} onOpen={onOpen} />);
    fireEvent.press(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledWith(thread);
  });
});
