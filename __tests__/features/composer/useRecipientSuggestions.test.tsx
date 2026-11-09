import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import * as Contacts from 'expo-contacts';

import { queryClient } from '@/core/queryClient';
import { useRecipientSuggestions } from '@/features/composer/useRecipientSuggestions';

import { core } from '../../helpers/fixtures';

jest.mock('expo-contacts', () => ({
  Fields: { Emails: 'emails', Name: 'name' },
  getPermissionsAsync: jest.fn(),
  getContactsAsync: jest.fn(),
}));

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('recipient suggestions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    core.suggestAddresses.mockResolvedValue([
      { name: 'Claire Dubois', email: 'claire@atlas.example' },
      { name: 'Claude', email: 'claude@x.org' },
    ]);
  });

  it('lists people from past mail first, then contacts, each address once', async () => {
    (Contacts.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (Contacts.getContactsAsync as jest.Mock).mockResolvedValue({
      data: [
        { name: 'Claire D.', emails: [{ email: 'CLAIRE@atlas.example' }, { email: 'claire.perso@x.org' }] },
        { name: 'Clara', emails: [] },
      ],
    });
    const { result } = renderHook(() => useRecipientSuggestions('cla'), { wrapper });
    await waitFor(() => expect(result.current).toHaveLength(3));
    expect(result.current.map((address) => address.email)).toEqual([
      'claire@atlas.example',
      'claude@x.org',
      'claire.perso@x.org',
    ]);
    expect(core.suggestAddresses).toHaveBeenCalledWith('cla', 8);
  });

  it('never reads contacts the user has not allowed', async () => {
    (Contacts.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });
    const { result } = renderHook(() => useRecipientSuggestions('cla'), { wrapper });
    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(Contacts.getContactsAsync).not.toHaveBeenCalled();
  });

  it('suggests nothing for an empty query', () => {
    const { result } = renderHook(() => useRecipientSuggestions('  '), { wrapper });
    expect(result.current).toEqual([]);
    expect(core.suggestAddresses).not.toHaveBeenCalled();
  });
});
