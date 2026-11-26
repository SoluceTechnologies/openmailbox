import { useState } from 'react';
import { TextInput } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { queryClient } from '@/core/queryClient';
import { RecipientField } from '@/features/composer/components/RecipientField';
import { pickContactAddress } from '@/services/contacts';
import type { MailAddress } from '@/utils/addresses';
import i18n from '@/utils/i18n';

import { core } from '../../helpers/fixtures';
import { renderWithProviders } from '../../helpers/render';

jest.mock('@/services/contacts', () => ({
  pickContactAddress: jest.fn(),
  contactAddresses: jest.fn(async () => []),
  showContactCard: jest.fn(async () => undefined),
}));

let latest: MailAddress[] = [];

function Harness({ initial = [] as MailAddress[], autoFocus = true, onFocus }: { initial?: MailAddress[]; autoFocus?: boolean; onFocus?: () => void }) {
  const [addresses, setAddresses] = useState(initial);
  const [text, setText] = useState('');
  latest = addresses;
  return (
    <RecipientField label="To:" value={addresses} onChange={setAddresses} text={text} onTextChange={setText} autoFocus={autoFocus} onFocus={onFocus} />
  );
}

const A = { email: 'a@x.org' };
const B = { email: 'b@x.org' };
const CLAIRE = { name: 'Claire Dubois', email: 'claire@atlas.example' };
const CLAIRE_HOME = { name: 'Claire Dubois', email: 'claire@home.example' };
const backspace = () => fireEvent(screen.getByLabelText('To'), 'keyPress', { nativeEvent: { key: 'Backspace' } });
const layout = (testID: string, x: number, width: number) =>
  fireEvent(screen.getByTestId(testID, { includeHiddenElements: true }), 'layout', { nativeEvent: { layout: { x, y: 0, width, height: 20 } } });

describe('RecipientField', () => {
  beforeAll(() => i18n.changeLanguage('en'));
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    core.suggestAddresses.mockResolvedValue([]);
  });

  it('turns a typed address into a chip at the comma', () => {
    renderWithProviders(<Harness />);
    fireEvent.changeText(screen.getByLabelText('To'), 'claire@atlas.example,');
    expect(latest).toEqual([{ name: undefined, email: 'claire@atlas.example' }]);
    expect(screen.getByText('claire@atlas.example')).toBeOnTheScreen();
    expect(screen.getByLabelText('To').props.value).toBe('');
  });

  it('keeps an invalid entry as text', () => {
    renderWithProviders(<Harness />);
    fireEvent.changeText(screen.getByLabelText('To'), 'claire@,');
    expect(latest).toEqual([]);
    expect(screen.getByLabelText('To').props.value).toBe('claire@');
  });

  it('selects a recipient on tap instead of removing it', () => {
    renderWithProviders(<Harness initial={[A, B]} />);
    fireEvent.press(screen.getByRole('button', { name: 'a@x.org' }));
    expect(latest).toEqual([A, B]);
    expect(screen.getByRole('button', { name: 'a@x.org' })).toBeSelected();
    fireEvent.press(screen.getByRole('button', { name: 'a@x.org' }));
    expect(screen.getByRole('button', { name: 'a@x.org' })).not.toBeSelected();
  });

  it('selects the last recipient with backspace, then removes it', () => {
    renderWithProviders(<Harness initial={[A, B]} />);
    backspace();
    expect(latest).toEqual([A, B]);
    expect(screen.getByRole('button', { name: 'b@x.org' })).toBeSelected();
    backspace();
    expect(latest).toEqual([A]);
  });

  it('removes the selected recipient with backspace', () => {
    renderWithProviders(<Harness initial={[A, B]} />);
    fireEvent.press(screen.getByRole('button', { name: 'a@x.org' }));
    backspace();
    expect(latest).toEqual([B]);
  });

  it('lets typing go on after a recipient was selected', () => {
    renderWithProviders(<Harness initial={[A, B]} />);
    fireEvent.press(screen.getByRole('button', { name: 'a@x.org' }));
    fireEvent.changeText(screen.getByLabelText('To'), 'c');
    expect(screen.getByRole('button', { name: 'a@x.org' })).not.toBeSelected();
    backspace();
    expect(latest).toEqual([A, B]);
  });

  it('removes a recipient through its accessibility action', () => {
    renderWithProviders(<Harness initial={[A, B]} />);
    fireEvent(screen.getByRole('button', { name: 'a@x.org' }), 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
    expect(latest).toEqual([B]);
  });

  it('shows the name of a recipient and its address to screen readers', () => {
    renderWithProviders(<Harness initial={[CLAIRE]} />);
    expect(screen.getByText('Claire Dubois')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Claire Dubois, claire@atlas.example' })).toBeOnTheScreen();
  });

  it('swaps the selected recipient to another address of the same person', async () => {
    core.suggestAddresses.mockResolvedValue([CLAIRE, CLAIRE_HOME, { name: 'Claire Martin', email: 'claire@martin.example' }]);
    renderWithProviders(<Harness initial={[CLAIRE, A]} />);
    fireEvent.press(screen.getByRole('button', { name: 'Claire Dubois, claire@atlas.example' }));
    fireEvent.press(await screen.findByRole('button', { name: 'claire@home.example' }));
    expect(latest).toEqual([CLAIRE_HOME, A]);
    expect(screen.queryByText('claire@martin.example')).toBeNull();
  });

  it('swaps without duplicating an address already chosen', async () => {
    core.suggestAddresses.mockResolvedValue([CLAIRE, CLAIRE_HOME]);
    renderWithProviders(<Harness initial={[CLAIRE, CLAIRE_HOME]} />);
    fireEvent.press(screen.getByRole('button', { name: 'Claire Dubois, claire@atlas.example' }));
    fireEvent.press(await screen.findByRole('button', { name: 'claire@home.example' }));
    expect(latest).toEqual([CLAIRE_HOME]);
  });

  it('opens the contact card of the selected recipient', async () => {
    const { showContactCard } = jest.requireMock('@/services/contacts') as { showContactCard: jest.Mock };
    renderWithProviders(<Harness initial={[CLAIRE]} />);
    fireEvent.press(screen.getByRole('button', { name: 'Claire Dubois, claire@atlas.example' }));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: i18n.t('reader.contactCard') })));
    expect(showContactCard).toHaveBeenCalledWith(CLAIRE);
  });

  it('folds into one line once left and opens again on tap', () => {
    const focus = jest.spyOn(TextInput.prototype, 'focus');
    renderWithProviders(<Harness initial={[{ name: 'Alice', email: 'alice@x.org' }, A, B]} autoFocus={false} />);
    expect(screen.queryByRole('button', { name: 'a@x.org' })).toBeNull();
    layout('recipient-summary', 0, 200);
    layout('recipient-summary-name-0', 0, 60);
    layout('recipient-summary-name-1', 64, 80);
    layout('recipient-summary-name-2', 148, 80);
    layout('recipient-summary-more', 0, 70);
    expect(screen.getByText('Alice')).toBeOnTheScreen();
    expect(screen.getByText('& 2 more')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('recipient-summary'));
    expect(focus).toHaveBeenCalled();
    fireEvent(screen.getByLabelText('To'), 'focus');
    expect(screen.getByRole('button', { name: 'a@x.org' })).toBeOnTheScreen();
  });

  it('lists every name when they all fit', () => {
    renderWithProviders(<Harness initial={[{ name: 'Alice', email: 'alice@x.org' }, A]} autoFocus={false} />);
    layout('recipient-summary', 0, 300);
    layout('recipient-summary-name-0', 0, 60);
    layout('recipient-summary-name-1', 64, 80);
    layout('recipient-summary-more', 0, 70);
    expect(screen.getByText('Alice,')).toBeOnTheScreen();
    expect(screen.getByText('a@x.org')).toBeOnTheScreen();
    expect(screen.queryByText(/more/)).toBeNull();
  });

  it('stays open while text is typed', () => {
    renderWithProviders(<Harness initial={[A]} autoFocus={false} />);
    fireEvent.changeText(screen.getByLabelText('To'), 'cla');
    expect(screen.getByRole('button', { name: 'a@x.org' })).toBeOnTheScreen();
  });

  it('folds when it loses the focus', async () => {
    renderWithProviders(<Harness initial={[A]} />);
    expect(screen.queryByTestId('recipient-summary')).toBeNull();
    fireEvent(screen.getByLabelText('To'), 'blur');
    await waitFor(() => expect(screen.getByTestId('recipient-summary')).toHaveAccessibleName('To: a@x.org'));
  });

  it('tells the parent when it gets the focus', () => {
    const onFocus = jest.fn();
    renderWithProviders(<Harness onFocus={onFocus} />);
    act(() => screen.getByLabelText('To').props.onFocus());
    expect(onFocus).toHaveBeenCalled();
  });

  it('adds a suggestion when it is tapped', async () => {
    core.suggestAddresses.mockResolvedValue([{ name: 'Claire Dubois', email: 'claire@atlas.example' }]);
    renderWithProviders(<Harness />);
    fireEvent.changeText(screen.getByLabelText('To'), 'cla');
    fireEvent.press(await screen.findByText('Claire Dubois'));
    expect(latest).toEqual([{ name: 'Claire Dubois', email: 'claire@atlas.example' }]);
  });

  it('adds the address picked from the contacts', async () => {
    (pickContactAddress as jest.Mock).mockResolvedValue({ name: 'Nadia Benali', email: 'nadia@x.org' });
    renderWithProviders(<Harness />);
    await act(async () => fireEvent.press(screen.getByRole('button', { name: i18n.t('compose.addFromContacts') })));
    expect(latest).toEqual([{ name: 'Nadia Benali', email: 'nadia@x.org' }]);
  });
});
