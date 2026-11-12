import { fireEvent, screen } from '@testing-library/react-native';

import { CategoryBar } from '@/features/categories/CategoryBar';
import i18n from '@/utils/i18n';

import { renderWithProviders } from '../../helpers/render';

describe('category bar', () => {
  beforeAll(() => i18n.changeLanguage('en'));

  it('names the chosen category and offers the others as icons', () => {
    const onChange = jest.fn();
    renderWithProviders(<CategoryBar value="primary" onChange={onChange} />);
    expect(screen.getByText('Primary')).toBeOnTheScreen();
    expect(screen.queryByText('Updates')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Primary' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'All Mail' })).not.toBeSelected();

    fireEvent.press(screen.getByRole('tab', { name: 'Updates' }));
    expect(onChange).toHaveBeenCalledWith('updates');
    fireEvent.press(screen.getByRole('tab', { name: 'Primary' }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('marks the categories that received new mail', () => {
    renderWithProviders(<CategoryBar value="primary" withNewMail={['updates']} onChange={jest.fn()} />);
    expect(screen.getByRole('tab', { name: 'Updates' })).toHaveAccessibilityValue({ text: 'New mail' });
    expect(screen.getByRole('tab', { name: 'Promotions' })).not.toHaveAccessibilityValue({ text: 'New mail' });
  });
});
