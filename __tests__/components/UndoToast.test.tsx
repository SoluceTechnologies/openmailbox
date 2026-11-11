import { act, fireEvent, screen } from '@testing-library/react-native';

import { UndoToast } from '@/components/UndoToast';
import { useUndoStore } from '@/stores/undoStore';
import i18n from '@/utils/i18n';

import { core } from '../helpers/fixtures';
import { renderWithProviders } from '../helpers/render';

describe('UndoToast', () => {
  beforeAll(() => i18n.changeLanguage('en'));
  beforeEach(() => {
    jest.clearAllMocks();
    useUndoStore.setState({ entry: null });
  });

  it('stays hidden until something can be undone', () => {
    renderWithProviders(<UndoToast />);
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('tells what happened and undoes it', async () => {
    renderWithProviders(<UndoToast />);
    act(() =>
      useUndoStore.getState().show({
        label: 'Archived',
        moves: [{ relocation: { emailIds: ['e1'], targetMailboxId: 'archive' }, sourceMailboxId: 'inbox' }],
      }),
    );
    expect(screen.getByText('Archived')).toBeOnTheScreen();

    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Undo' })));

    expect(core.moveEmails).toHaveBeenCalledWith(['e1'], 'archive', expect.anything(), 0);
    expect(screen.queryByText('Archived')).toBeNull();
  });

  it('only tells what happened when there is nothing to undo', () => {
    renderWithProviders(<UndoToast />);
    act(() => useUndoStore.getState().show({ label: 'Message sent', moves: [] }));
    expect(screen.getByText('Message sent')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });
});
