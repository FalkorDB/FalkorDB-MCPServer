import { isLocalBindAddress, isUnauthenticatedNetworkExposure } from './bind-address.js';

describe('Bind Address Utility', () => {
  describe('isLocalBindAddress', () => {
    describe('local addresses', () => {
      const localValues = [
        '127.0.0.1', // default loopback
        '127.0.0.2', // other 127.0.0.0/8 loopback
        '127.255.255.255', // top of the 127.0.0.0/8 range
        '::1', // bare IPv6 loopback
        '[::1]', // bracketed IPv6 loopback
        '::ffff:127.0.0.1', // IPv4-mapped IPv6 loopback
        '  127.0.0.1  ', // loopback with surrounding whitespace
        '', // empty string (unset)
        undefined, // undefined (unset)
      ];

      it.each(localValues)('treats %s as local', (value) => {
        expect(isLocalBindAddress(value)).toBe(true);
      });
    });

    describe('non-local addresses', () => {
      const nonLocalValues = [
        '0.0.0.0', // wildcard IPv4
        '::', // wildcard IPv6
        '192.168.1.10', // LAN address
        '10.0.0.5', // private network address
        '8.8.8.8', // public address
        'localhost', // hostname (Compose itself rejects this)
        'not-an-ip', // garbage input
        '128.0.0.1', // address that merely starts with a similar prefix
        '127.999.999.999', // out-of-range octets shaped like an IPv4 address
        '127.0.0.256', // out-of-range last octet
        '127.00.0.1', // leading zero (historically parsed as octal)
        '::ffff:999.0.0.1', // IPv4-mapped form with an invalid embedded octet
        '127.0.0.1.5', // too many octets
      ];

      it.each(nonLocalValues)('treats %s as non-local', (value) => {
        expect(isLocalBindAddress(value)).toBe(false);
      });
    });
  });

  describe('isUnauthenticatedNetworkExposure', () => {
    it('is true for a non-local HTTP bind with no API key', () => {
      expect(
        isUnauthenticatedNetworkExposure({ transport: 'http', bindAddress: '0.0.0.0', apiKey: '' })
      ).toBe(true);
    });

    it('is false for a non-local HTTP bind with an API key set', () => {
      expect(
        isUnauthenticatedNetworkExposure({ transport: 'http', bindAddress: '0.0.0.0', apiKey: 'secret' })
      ).toBe(false);
    });

    it('is false for a local HTTP bind with no API key', () => {
      expect(
        isUnauthenticatedNetworkExposure({ transport: 'http', bindAddress: '127.0.0.1', apiKey: '' })
      ).toBe(false);
    });

    it('is false for a non-local bind with no API key when transport is stdio', () => {
      expect(
        isUnauthenticatedNetworkExposure({ transport: 'stdio', bindAddress: '0.0.0.0', apiKey: '' })
      ).toBe(false);
    });

    it('is false when bindAddress is unset (defaults to local)', () => {
      expect(
        isUnauthenticatedNetworkExposure({ transport: 'http', bindAddress: undefined, apiKey: '' })
      ).toBe(false);
    });
  });
});
