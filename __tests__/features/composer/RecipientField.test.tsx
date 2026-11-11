import { useState } from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';

import { RecipientField } from '@/features/composer/components/RecipientField';
import { pickContactAddress } from '@/services/contacts';
import type { MailAddress } from '@/utils/addresses';
import i18n from '@/utils/i18n';

import { core } from '../../helpers/fixtures';
import { renderWithProviders } from '../../helpers/render';

jest.mock('@/services/contacts', () => ({
  pickContactAddress: jest.fn(),
  contactAddresses: jest.fn(async () => []),
}));

let latest: MailAddress[] = [];

function Harness({ initial = [] as MailAddress[] }) {
  const [addresses, setAddresses] = useState(initial);
  const [text, setText] = useState('');
  latest = addresses;
  return <RecipientField label="To:" value={addresses} onChange={setAddresses} text={text} onTextChange={setText} />;
}

describe('RecipientField', () => {
  beforeAll(() => i18n.changeLanguage('en'));
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('removes the last chip with backspace in an empty field', () => {
    renderWithProviders(<Harness initial={[{ email: 'a@x.org' }, { email: 'b@x.org' }]} />);
    fireEvent(screen.getByLabelText('To'), 'keyPress', { nativeEvent: { key: 'Backspace' } });
    expect(latest).toEqual([{ email: 'a@x.org' }]);
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
