import { fireEvent, screen } from '@testing-library/react-native';
import * as Sharing from 'expo-sharing';

import AttachmentScreen from '../../app/attachment';
import i18n from '@/utils/i18n';

import { renderWithProviders } from '../helpers/render';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useRouter: () => mockRouter,
  router: { back: () => mockRouter.back(), replace: (href: string) => mockRouter.replace(href), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
}));
const PDF = { uri: 'file:///cache/attachments/email-1-0/Facture.pdf', name: 'Facture.pdf', mimeType: 'application/pdf' };
let mockParams = PDF;
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(async () => undefined) }));
const mockWrite = jest.fn();
jest.mock('expo-video', () => {
  const { createElement } = require('react');
  const { View } = require('react-native');
  return {
    useVideoPlayer: (source: string) => ({ source }),
    VideoView: (props: object) => createElement(View, { testID: 'video-view', ...props }),
  };
});
jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    write = mockWrite;
    constructor(uri: string) {
      this.uri = uri;
    }
  },
}));

describe('attachment viewer', () => {
  beforeAll(() => i18n.changeLanguage('en'));
  beforeEach(() => {
    mockParams = PDF;
    mockWrite.mockClear();
  });

  it('shows a photo whole, centred, instead of in the web view', () => {
    mockParams = { uri: 'file:///cache/attachments/email-1-1/IMG_0005.jpeg', name: 'IMG_0005.jpeg', mimeType: 'image/jpeg' };
    renderWithProviders(<AttachmentScreen />);
    expect(screen.queryByTestId('web-view')).toBeNull();
    expect(screen.getByLabelText('IMG_0005.jpeg').props.source).toEqual({ uri: mockParams.uri });
  });

  it('fits a vector image to the screen without running its scripts', () => {
    mockParams = { uri: 'file:///cache/attachments/email-1-2/logo.svg', name: 'logo.svg', mimeType: 'image/svg+xml' };
    renderWithProviders(<AttachmentScreen />);
    const webView = screen.getByTestId('web-view');
    expect(webView.props.source).toEqual({ uri: 'file:///cache/attachments/email-1-2/logo.svg.view.html' });
    expect(webView.props.javaScriptEnabled).toBe(false);
    expect(mockWrite).toHaveBeenCalledWith(expect.stringContaining('<img src="file:///cache/attachments/email-1-2/logo.svg">'));
    expect(mockWrite).toHaveBeenCalledWith(expect.stringContaining('width=device-width'));
  });

  it.each([
    ['export.csv', 'text/csv'],
    ['notes.txt', 'text/plain'],
    ['data.json', 'application/json'],
  ])('shows %s at a readable size', (name, mimeType) => {
    mockParams = { uri: `file:///cache/attachments/email-1-4/${name}`, name, mimeType };
    renderWithProviders(<AttachmentScreen />);
    expect(screen.getByTestId('web-view').props.source).toEqual({ uri: `${mockParams.uri}.view.html` });
    expect(mockWrite).toHaveBeenCalledWith(expect.stringContaining(`<iframe src="${mockParams.uri}"></iframe>`));
  });

  it('leaves web pages at their own layout', () => {
    mockParams = { uri: 'file:///cache/attachments/email-1-5/page.html', name: 'page.html', mimeType: 'text/html' };
    renderWithProviders(<AttachmentScreen />);
    expect(screen.getByTestId('web-view').props.source).toEqual({ uri: mockParams.uri });
  });

  it.each([
    ['memo.m4a', 'audio/mp4'],
    ['clip.mp4', 'video/mp4'],
  ])('plays %s in the native player', (name, mimeType) => {
    mockParams = { uri: `file:///cache/attachments/email-1-6/${name}`, name, mimeType };
    renderWithProviders(<AttachmentScreen />);
    const player = screen.getByTestId('video-view');
    expect(player.props.player).toEqual({ source: mockParams.uri });
    expect(player.props.nativeControls).toBe(true);
    expect(screen.queryByTestId('web-view')).toBeNull();
    expect(mockWrite).not.toHaveBeenCalled();
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
