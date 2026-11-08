import { LOCAL_TEST_PROVIDER, PROVIDERS, providerForAddress } from '@/features/accounts/providers';

describe('providers', () => {
  it('recognises a provider from the address domain, whatever its case', () => {
    expect(providerForAddress('alice@GMAIL.com')?.identifier).toBe('gmail');
    expect(providerForAddress('alice@me.com')?.identifier).toBe('icloud');
    expect(providerForAddress('alice@example.org')).toBeUndefined();
    expect(providerForAddress('not an address')).toBeUndefined();
  });

  it('links every named provider to its app password help page', () => {
    for (const provider of PROVIDERS.filter((candidate) => candidate.identifier !== 'other')) {
      expect(provider.appPasswordHelp).toMatch(/^https:\/\//);
    }
  });

  it('points the development entry at the local GreenMail server', () => {
    expect(LOCAL_TEST_PROVIDER.account).toEqual({ email: 'alice@example.com', password: 'secret' });
    expect(LOCAL_TEST_PROVIDER.servers?.imap.port).toBe(3993);
    expect(LOCAL_TEST_PROVIDER.servers?.smtp.port).toBe(3465);
  });
});
