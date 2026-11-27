import { screen } from '@testing-library/react-native';

import { OfflineBanner } from '@/components/OfflineBanner';
import i18n from '@/utils/i18n';

import { renderWithProviders } from '../helpers/render';

let mockOnline = false;
jest.mock('@/services/shared/network', () => ({ useIsOnline: () => mockOnline }));

describe('offline banner', () => {
  beforeAll(() => i18n.changeLanguage('en'));

  it('says on one line that the app is offline and that changes will follow', () => {
    mockOnline = false;
    renderWithProviders(<OfflineBanner />);
    const banner = screen.getByTestId('offline-banner');
    expect(banner.props.accessibilityLabel).toBe(i18n.t('offline.banner'));
    expect(screen.getByText('Offline')).toBeOnTheScreen();
    expect(screen.getByText(i18n.t('offline.detail'))).toHaveProp('numberOfLines', 1);
  });

  it('stays hidden while online', () => {
    mockOnline = true;
    renderWithProviders(<OfflineBanner />);
    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });
});
