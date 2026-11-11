import { displayName, formatAddressList, isEmail, parseAddressList, withoutAddresses } from '@/utils/addresses';

describe('parseAddressList', () => {
  it('accepts bare and named addresses separated by commas or semicolons', () => {
    expect(parseAddressList('bob@example.com; "Alice Martin" <alice@example.org>, ')).toEqual({
      addresses: [{ email: 'bob@example.com', name: undefined }, { email: 'alice@example.org', name: 'Alice Martin' }],
      invalid: [],
    });
  });

  it('reports what is not an address', () => {
    expect(parseAddressList('bob, carol@example').invalid).toEqual(['bob', 'carol@example']);
  });
});

describe('withoutAddresses', () => {
  it('drops excluded and duplicate addresses regardless of case', () => {
    const addresses = [{ email: 'Me@Example.com' }, { email: 'bob@example.com' }, { email: 'BOB@example.com' }];
    expect(withoutAddresses(addresses, ['me@example.com'])).toEqual([{ email: 'bob@example.com' }]);
  });
});

describe('address display', () => {
  it('prefers the name and falls back to the address', () => {
    expect(displayName({ name: '  Claire Dubois ', email: 'claire@example.com' })).toBe('Claire Dubois');
    expect(displayName({ name: '  ', email: 'claire@example.com' })).toBe('claire@example.com');
    expect(displayName(undefined)).toBe('');
  });

  it('lists recipients the way a header shows them', () => {
    expect(formatAddressList([{ name: 'Alice', email: 'alice@example.com' }, { email: 'bob@example.com' }])).toBe(
      'Alice <alice@example.com>, bob@example.com',
    );
  });

  it('only accepts addresses with a domain', () => {
    expect(isEmail(' alice@example.com ')).toBe(true);
    expect(isEmail('alice@localhost')).toBe(false);
    expect(isEmail('alice example.com')).toBe(false);
  });
});
