import { screen, waitFor } from '@testing-library/react-native';

import { ContactAvatar } from '@/features/avatars/ContactAvatar';
import { cachedAvatar, loadAvatar } from '@/features/avatars/avatarCache';
import { useSettingsStore } from '@/stores/settingsStore';

import { renderWithProviders } from '../../helpers/render';

jest.mock('@/features/avatars/avatarCache', () => ({ cachedAvatar: jest.fn(), loadAvatar: jest.fn() }));
jest.mock('expo-file-system', () => ({
  File: class {
    mockUri: string;
    constructor(mockUri: string) {
      this.mockUri = mockUri;
    }
    textSync() {
      if (this.mockUri.endsWith('broken.svg')) throw new Error('gone');
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1" fill="#0a66c2"/></svg>';
    }
  },
}));

const cachedAvatarMock = cachedAvatar as jest.Mock;
const loadAvatarMock = loadAvatar as jest.Mock;

describe('ContactAvatar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSettingsStore.setState({ contactPictures: true });
    cachedAvatarMock.mockReturnValue(undefined);
  });

  it('shows the initials, then the picture once it is found', async () => {
    loadAvatarMock.mockResolvedValue('file:///cache/avatars/claire');
    renderWithProviders(<ContactAvatar email="claire@lumen.example" name="Claire Dubois" />);

    expect(screen.getByText('CD')).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByTestId('avatar-picture')).toHaveProp('source', { uri: 'file:///cache/avatars/claire' }));
    expect(loadAvatarMock).toHaveBeenCalledWith('claire@lumen.example');
  });

  it('shows a saved picture straight away', () => {
    cachedAvatarMock.mockReturnValue('file:///cache/avatars/claire');
    renderWithProviders(<ContactAvatar email="claire@lumen.example" name="Claire Dubois" />);

    expect(screen.getByTestId('avatar-picture')).toBeOnTheScreen();
    expect(loadAvatarMock).not.toHaveBeenCalled();
  });

  it('keeps the initials when the address has no picture', async () => {
    loadAvatarMock.mockResolvedValue(null);
    renderWithProviders(<ContactAvatar email="bob@gmail.com" name="Bob" />);

    await waitFor(() => expect(loadAvatarMock).toHaveBeenCalled());
    expect(screen.getByText('B')).toBeOnTheScreen();
    expect(screen.queryByTestId('avatar-picture')).toBeNull();
  });

  it('looks nothing up when contact pictures are turned off', () => {
    useSettingsStore.setState({ contactPictures: false });
    cachedAvatarMock.mockReturnValue('file:///cache/avatars/claire');
    renderWithProviders(<ContactAvatar email="claire@lumen.example" name="Claire Dubois" />);

    expect(screen.getByText('CD')).toBeOnTheScreen();
    expect(cachedAvatarMock).not.toHaveBeenCalled();
    expect(loadAvatarMock).not.toHaveBeenCalled();
  });

  it("draws a brand's BIMI logo, an SVG, and the initials when it cannot be read", () => {
    cachedAvatarMock.mockReturnValue('file:///cache/avatars/linkedin.svg');
    const { rerender } = renderWithProviders(<ContactAvatar email="news@linkedin.com" name="LinkedIn" />);
    expect(screen.getByTestId('avatar-picture')).toBeOnTheScreen();
    expect(screen.queryByText('L')).toBeNull();

    cachedAvatarMock.mockReturnValue('file:///cache/avatars/broken.svg');
    rerender(<ContactAvatar email="news@broken.example" name="Broken" />);
    expect(screen.getByText('B')).toBeOnTheScreen();
  });
});
