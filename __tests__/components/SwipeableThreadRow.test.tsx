import { fireEvent, screen } from '@testing-library/react-native';

import { SwipeableThreadRow } from '@/features/threads/components/SwipeableThreadRow';
import i18n from '@/utils/i18n';

import { makeEmail, makeThread, NOW } from '../helpers/fixtures';
import { renderWithProviders } from '../helpers/render';

function setup(overrides: { canArchive?: boolean; flagged?: boolean } = {}) {
  const thread = makeThread({ isFlagged: overrides.flagged ?? false });
  const onAction = jest.fn();
  const onMore = jest.fn();
  renderWithProviders(
    <SwipeableThreadRow
      thread={thread}
      canArchive={overrides.canArchive ?? true}
      onOpen={jest.fn()}
      onAction={onAction}
      onMore={onMore}
    />,
  );
  return { thread, onAction, onMore };
}

describe('SwipeableThreadRow', () => {
  beforeAll(async () => {
    jest.useFakeTimers({ now: NOW });
    await i18n.changeLanguage('en');
  });
  afterAll(() => jest.useRealTimers());

  it('marks an unread thread as read from the leading swipe', () => {
    const { thread, onAction } = setup();
    fireEvent.press(screen.getByRole('button', { name: 'Read' }));
    expect(onAction).toHaveBeenCalledWith('markRead', thread);
  });

  it('offers More, Flag and Archive on the trailing swipe', () => {
    const { thread, onAction, onMore } = setup();
    fireEvent.press(screen.getByRole('button', { name: 'More' }));
    fireEvent.press(screen.getByRole('button', { name: 'Flag' }));
    fireEvent.press(screen.getByRole('button', { name: 'Archive' }));
    expect(onMore).toHaveBeenCalledWith(thread);
    expect(onAction.mock.calls).toEqual([
      ['flag', thread],
      ['archive', thread],
    ]);
  });

  it('offers Unflag on a flagged thread and Delete when there is no archive', () => {
    const { thread, onAction } = setup({ canArchive: false, flagged: true });
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Unflag' }));
    fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
    expect(onAction.mock.calls).toEqual([
      ['unflag', thread],
      ['delete', thread],
    ]);
  });

  it('says when the latest message was answered', () => {
    const thread = makeThread({ latest: makeEmail({ isAnswered: true }) });
    renderWithProviders(<SwipeableThreadRow thread={thread} canArchive onOpen={jest.fn()} onAction={jest.fn()} onMore={jest.fn()} />);
    expect(screen.getByText('Lancement du projet Atlas')).toBeOnTheScreen();
    expect(screen.getAllByRole('button').some((button) => /Replied/.test(button.props.accessibilityLabel ?? ''))).toBe(true);
  });
});
