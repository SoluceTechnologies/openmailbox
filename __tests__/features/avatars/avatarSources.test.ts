import { avatarSources, isPersonalMailDomain, organizationDomain } from '@/features/avatars/avatarSources';

const CLAIRE_HASH = 'fcff6bf802768fc08ef2ff4524a7edd6b26d79e94e4d8351982596ad03ead30e';

describe('avatar sources', () => {
  it('looks up Gravatar first, then the website of a professional domain', () => {
    expect(avatarSources(' Claire.Dubois@Lumen.example ')).toEqual([
      `https://gravatar.com/avatar/${CLAIRE_HASH}?s=128&d=404`,
      'https://lumen.example/apple-touch-icon.png',
      'https://lumen.example/favicon.ico',
    ]);
  });

  it('only looks up Gravatar for personal mail providers', () => {
    expect(avatarSources('alice@gmail.com')).toHaveLength(1);
    expect(avatarSources('bob@hotmail.fr')).toHaveLength(1);
    expect(avatarSources('carol@yahoo.co.uk')).toHaveLength(1);
  });

  it('has nothing to look up without a domain', () => {
    expect(avatarSources('')).toEqual([]);
    expect(avatarSources('undisclosed-recipients')).toEqual([]);
  });

  it('tells personal mail providers from companies', () => {
    for (const domain of ['gmail.com', 'icloud.com', 'orange.fr', 'free.fr', 'laposte.net', 'outlook.com', 'live.fr', 'gmx.de', 'proton.me']) {
      expect(isPersonalMailDomain(domain)).toBe(true);
    }
    for (const domain of ['soluce-technologies.com', 'ovhcloud.com', 'github.com']) {
      expect(isPersonalMailDomain(domain)).toBe(false);
    }
  });

  it('finds the website of a mail subdomain', () => {
    expect(organizationDomain('notifications.github.com')).toBe('github.com');
    expect(organizationDomain('news.bbc.co.uk')).toBe('bbc.co.uk');
    expect(organizationDomain('lumen.example')).toBe('lumen.example');
  });
});
