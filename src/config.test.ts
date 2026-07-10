import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const base = {
  PAYDIRT_API_KEY: 'abc123',
  PAYDIRT_CLIENT_ID: '17',
  PAYDIRT_TIMEZONE: 'America/Denver',
};

describe('loadConfig', () => {
  it('reads api key, client id, timezone, and defaults the base url', () => {
    const config = loadConfig(base);
    expect(config.apiKey).toBe('abc123');
    expect(config.clientId).toBe('17');
    expect(config.timeZone).toBe('America/Denver');
    expect(config.baseUrl).toBe('https://app.paydirtapp.com/api/v1');
  });

  it('uses a provided base url', () => {
    const config = loadConfig({
      ...base,
      PAYDIRT_BASE_URL: 'https://staging.paydirtapp.com/api/v2',
    });
    expect(config.baseUrl).toBe('https://staging.paydirtapp.com/api/v2');
  });

  it('strips a trailing slash from the base url', () => {
    const config = loadConfig({ ...base, PAYDIRT_BASE_URL: 'https://app.paydirtapp.com/api/v1/' });
    expect(config.baseUrl).toBe('https://app.paydirtapp.com/api/v1');
  });

  it('throws a clear error when the api key is missing', () => {
    expect(() => loadConfig({ PAYDIRT_CLIENT_ID: '17', PAYDIRT_TIMEZONE: 'America/Denver' })).toThrow(
      /PAYDIRT_API_KEY/,
    );
  });

  it('throws a clear error when the client id is missing', () => {
    expect(() => loadConfig({ PAYDIRT_API_KEY: 'abc123', PAYDIRT_TIMEZONE: 'America/Denver' })).toThrow(
      /PAYDIRT_CLIENT_ID/,
    );
  });

  it('throws when the client id is not a positive integer', () => {
    expect(() => loadConfig({ ...base, PAYDIRT_CLIENT_ID: 'abc' })).toThrow(/PAYDIRT_CLIENT_ID/);
  });

  it('throws a clear error when the timezone is missing', () => {
    expect(() => loadConfig({ PAYDIRT_API_KEY: 'abc123', PAYDIRT_CLIENT_ID: '17' })).toThrow(
      /PAYDIRT_TIMEZONE/,
    );
  });

  it('throws when the timezone is not a valid IANA zone', () => {
    expect(() => loadConfig({ ...base, PAYDIRT_TIMEZONE: 'Mars/Phobos' })).toThrow(/PAYDIRT_TIMEZONE/);
  });

  it('throws when the api key is blank', () => {
    expect(() => loadConfig({ ...base, PAYDIRT_API_KEY: '   ' })).toThrow(/PAYDIRT_API_KEY/);
  });
});
