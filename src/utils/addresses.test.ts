import { parseAddressList, withoutAddresses } from './addresses';

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
