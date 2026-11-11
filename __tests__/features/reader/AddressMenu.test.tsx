import { fireEvent, screen } from '@testing-library/react-native';

import { AddressMenu } from '@/features/reader/components/AddressMenu';
import { showContactCard } from '@/services/contacts';
import i18n from '@/utils/i18n';

import { renderWithProviders } from '../../helpers/render';

const mockRouter = { push: jest.fn() };
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useRouter: () => mockRouter }));
jest.mock('@/services/contacts', () => ({ showContactCard: jest.fn(async () => undefined) }));

const ADDRESS = { name: 'Forum Rust FR', email: 'notifications@forum.example' };

describe('address menu', () => {
  beforeAll(() => i18n.changeLanguage('en'));
  beforeEach(() => jest.clearAllMocks());

  it('names the sender and, when tapped, offers to write to it or see its contact card', () => {
    renderWithProviders(<AddressMenu address={ADDRESS} />);
    const name = screen.getByRole('button', { name: 'Forum Rust FR <notifications@forum.example>' });
    expect(screen.getByText('Forum Rust FR')).toBeOnTheScreen();
    expect(screen.queryByText('notifications@forum.example')).toBeNull();

    fireEvent.press(name);
    expect(screen.getByText('notifications@forum.example')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('New Message'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/compose', params: { to: 'notifications@forum.example' } });

    fireEvent.press(name);
    fireEvent.press(screen.getByText('View Contact Card'));
    expect(showContactCard).toHaveBeenCalledWith(ADDRESS);
  });
});
