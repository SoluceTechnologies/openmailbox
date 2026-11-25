import { Alert } from 'react-native';
import { ThemeProvider } from 'expo-router';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { HtmlBody } from '@/features/reader/components/HtmlBody';
import { lightTheme } from '@/theme';
import i18n from '@/utils/i18n';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), router: { push: (href: unknown) => mockPush(href) } }));

describe('HtmlBody links', () => {
  beforeAll(() => i18n.changeLanguage('en'));
  beforeEach(() => jest.clearAllMocks());

  const show = () => {
    render(
      <ThemeProvider value={lightTheme}>
        <HtmlBody html='<a href="https://openmailbox.eu/help">Help</a>' allowRemoteContent={false} />
      </ThemeProvider>,
    );
    fireEvent(screen.root, 'layout', { nativeEvent: { layout: { width: 320, height: 120 } } });
    return screen.getByTestId('web-view').props.onShouldStartLoadWithRequest;
  };

  it('asks before opening a tapped link, also when Android leaves out the frame', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const onShouldStartLoadWithRequest = show();

    expect(onShouldStartLoadWithRequest({ url: 'https://openmailbox.eu/help' })).toBe(false);
    expect(onShouldStartLoadWithRequest({ url: 'https://openmailbox.eu/help', isTopFrame: true })).toBe(false);

    expect(alert).toHaveBeenCalledTimes(2);
    expect(alert).toHaveBeenCalledWith('Open this link?', 'openmailbox.eu', expect.any(Array));
  });

  it('ignores what frames inside the mail load', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    expect(show()({ url: 'https://tracker.example/pixel', isTopFrame: false })).toBe(false);

    expect(alert).not.toHaveBeenCalled();
  });

  it('writes a new message for a mailto link', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    expect(show()({ url: 'mailto:bob@example.com?subject=Hi' })).toBe(false);

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/compose', params: { mailto: 'mailto:bob@example.com?subject=Hi' } });
    expect(alert).not.toHaveBeenCalled();
  });
});
