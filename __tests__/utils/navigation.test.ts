import { goBack } from '@/utils/navigation';

const mockRouter = { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn() };
jest.mock('expo-router', () => ({
  router: {
    back: () => mockRouter.back(),
    replace: (href: string) => mockRouter.replace(href),
    canGoBack: () => mockRouter.canGoBack(),
  },
}));

describe('goBack', () => {
  beforeEach(() => jest.clearAllMocks());

  it('goes back when a screen is behind', () => {
    mockRouter.canGoBack.mockReturnValue(true);
    goBack();
    expect(mockRouter.back).toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('goes home from a screen opened on its own', () => {
    mockRouter.canGoBack.mockReturnValue(false);
    goBack();
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });
});
