import { Security } from '@openmailbox/mail-core';

import {
  LOCAL_TEST_PROVIDER,
  OVH_OFFERS,
  PROVIDERS,
  providerForAccount,
  providerForAddress,
  providerName,
} from '@/features/accounts/providers';

describe('providers', () => {
  it('lists the providers in order, without Microsoft', () => {
    expect(PROVIDERS.map((provider) => provider.identifier)).toEqual([
      'gmail',
      'icloud',
      'ovhcloud',
      'ionos',
      'yahoo',
      'other',
    ]);
  });

  it('gives every named provider a brand mark and its servers', () => {
    for (const provider of PROVIDERS.filter((candidate) => !['other', 'ovhcloud'].includes(candidate.identifier))) {
      expect(provider.brand).toBeDefined();
      expect(provider.servers?.imap.host).toMatch(/\./);
      expect(provider.servers?.smtp.host).toMatch(/\./);
    }
  });

  it('recognises a provider from the address domain, whatever its case', () => {
    expect(providerForAddress('alice@GMAIL.com')?.identifier).toBe('gmail');
    expect(providerForAddress('alice@me.com')?.identifier).toBe('icloud');
    expect(providerForAddress('alice@yahoo.fr')?.identifier).toBe('yahoo');
    expect(providerForAddress('alice@example.org')).toBeUndefined();
    expect(providerForAddress('not an address')).toBeUndefined();
  });

  it('links providers that require app passwords to their help page', () => {
    for (const identifier of ['gmail', 'icloud', 'yahoo']) {
      expect(PROVIDERS.find((provider) => provider.identifier === identifier)?.appPasswordHelp).toMatch(/^https:\/\//);
    }
  });

  it('offers the four OVHcloud mail products with their servers', () => {
    expect(OVH_OFFERS.map((offer) => offer.identifier)).toEqual(['mxplan', 'emailpro', 'exchange', 'zimbra']);
    const mxplan = OVH_OFFERS[0];
    expect(mxplan.servers.imap).toEqual({ host: 'ssl0.ovh.net', port: 993, security: Security.Tls });
    expect(mxplan.servers.smtp).toEqual({ host: 'ssl0.ovh.net', port: 465, security: Security.Tls });
    expect(mxplan.editableHost).toBe(false);
    const emailPro = OVH_OFFERS[1];
    expect(emailPro.servers.smtp.port).toBe(587);
    expect(emailPro.servers.smtp.security).toBe(Security.StartTls);
    expect(OVH_OFFERS.slice(1).every((offer) => offer.editableHost)).toBe(true);
  });

  it('points the development entry at the local GreenMail server', () => {
    expect(LOCAL_TEST_PROVIDER.account).toEqual({ email: 'alice@example.com', password: 'secret' });
    expect(LOCAL_TEST_PROVIDER.servers?.imap.port).toBe(3993);
    expect(LOCAL_TEST_PROVIDER.servers?.smtp.port).toBe(3465);
  });

  it("tells an account's provider, and its OVHcloud offer, from its incoming server", () => {
    const at = (host: string) => ({ imap: { host } });
    expect(providerForAccount(at('imap.gmail.com'))?.provider.identifier).toBe('gmail');
    expect(providerForAccount(at('imap.mail.me.com'))?.provider.identifier).toBe('icloud');
    expect(providerForAccount(at('IMAP.ionos.de'))?.provider.identifier).toBe('ionos');
    expect(providerForAccount(at('imap.mail.yahoo.com'))?.provider.identifier).toBe('yahoo');
    expect(providerForAccount(at(LOCAL_TEST_PROVIDER.servers!.imap.host))?.provider.identifier).toBe('local');
    expect(providerName(at('pro2.mail.ovh.net'))).toBe('OVHcloud Email Pro');
    expect(providerName(at('ssl0.ovh.net'))).toBe('OVHcloud MX Plan');
    expect(providerName(at('mail.ovh.net'))).toBe('OVHcloud');
    expect(providerForAccount(at('mail.infomaniak.com'))).toBeUndefined();
    expect(providerName(at('mail.infomaniak.com'))).toBe('infomaniak.com');
  });
});
