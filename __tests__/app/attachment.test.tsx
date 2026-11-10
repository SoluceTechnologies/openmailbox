import { fireEvent, screen } from '@testing-library/react-native';
import * as Sharing from 'expo-sharing';

import AttachmentScreen from '../../app/attachment';
import i18n from '@/utils/i18n';

import { renderWithProviders } from '../helpers/render';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));
const PDF = { uri: 'file:///cache/attachments/email-1-0/Facture.pdf', name: 'Facture.pdf', mimeType: 'application/pdf' };
let mockParams = PDF;
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(async () => undefined) }));

describe('attachment viewer', () => {
  beforeAll(() => i18n.changeLanguage('en'));
  beforeEach(() => {
    mockParams = PDF;
  });

  it('shows a photo whole, centred, instead of in the web view', () => {
    mockParams = { uri: 'file:///cache/attachments/email-1-1/IMG_0005.jpeg', name: 'IMG_0005.jpeg', mimeType: 'image/jpeg' };
    renderWithProviders(<AttachmentScreen />);
    expect(screen.queryByTestId('web-view')).toBeNull();
    expect(screen.getByLabelText('IMG_0005.jpeg').props.source).toEqual({ uri: mockParams.uri });
  });

  it('shows the file without running scripts', () => {
    renderWithProviders(<AttachmentScreen />);
    const webView = screen.getByTestId('web-view');
    expect(webView.props.source).toEqual({ uri: 'file:///cache/attachments/email-1-0/Facture.pdf' });
    expect(webView.props.javaScriptEnabled).toBe(false);
    expect(webView.props.allowingReadAccessToURL).toBe('file:///cache/attachments/email-1-0/');
    expect(screen.getByText('Facture.pdf')).toBeOnTheScreen();
  });

  it('shares the file and closes', () => {
    renderWithProviders(<AttachmentScreen />);
    fireEvent.press(screen.getByRole('button', { name: i18n.t('reader.share') }));
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/attachments/email-1-0/Facture.pdf', {
      mimeType: 'application/pdf',
      dialogTitle: 'Facture.pdf',
    });
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(mockRouter.back).toHaveBeenCalled();
  });
});
