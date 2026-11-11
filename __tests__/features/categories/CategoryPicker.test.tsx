import { fireEvent, screen } from '@testing-library/react-native';
import { Category } from '@openmailbox/mail-core';

import { CategoryPicker } from '@/features/categories/CategoryPicker';
import i18n from '@/utils/i18n';

import { core } from '../../helpers/fixtures';
import { renderWithProviders } from '../../helpers/render';

const SENDER = { name: 'Weekly News', email: 'editor@weekly.example' };

describe('category picker', () => {
  beforeAll(() => i18n.changeLanguage('en'));
  beforeEach(() => jest.clearAllMocks());

  it('moves the sender to the chosen category and closes', () => {
    const onClose = jest.fn();
    renderWithProviders(<CategoryPicker sender={SENDER} current={Category.Updates} onClose={onClose} />);
    expect(screen.getByText('Move Mail from Weekly News')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Primary'));
    expect(core.setSenderCategory).toHaveBeenCalledWith('editor@weekly.example', Category.Primary);
    expect(onClose).toHaveBeenCalled();
  });

  it('leaves the sender alone when the current category is chosen again', () => {
    renderWithProviders(<CategoryPicker sender={SENDER} current={Category.Updates} onClose={jest.fn()} />);
    fireEvent.press(screen.getByText('Updates'));
    expect(core.setSenderCategory).not.toHaveBeenCalled();
  });
});
