import { describe, expect, it } from 'vitest';
import {
  isAllowedApiUrl,
  isAllowedAppUrl,
  isSafeExternalUrl,
  parsedHttpUrl,
} from '../src/main/url-policy';

describe('política de URLs', () => {
  it('permite somente HTTPS na origem exata do LiveChat', () => {
    expect(isAllowedAppUrl('https://livechat.kaiangazineu.dev/chat')).toBe(true);
    expect(isAllowedAppUrl('https://livechat.kaiangazineu.dev.evil.test/chat')).toBe(false);
    expect(isAllowedAppUrl('http://livechat.kaiangazineu.dev/chat')).toBe(false);
    expect(isAllowedAppUrl('https://user@livechat.kaiangazineu.dev/chat')).toBe(false);
  });

  it('aceita somente a origem HTTPS exata da API de produção', () => {
    expect(isAllowedApiUrl('https://livechat-api.kaiangazineu.dev')).toBe(true);
    expect(isAllowedApiUrl('https://livechat-api.kaiangazineu.dev/')).toBe(true);
    expect(isAllowedApiUrl('https://livechat-api.kaiangazineu.dev.evil.test')).toBe(false);
    expect(isAllowedApiUrl('http://livechat-api.kaiangazineu.dev')).toBe(false);
    expect(isAllowedApiUrl('https://livechat-api.kaiangazineu.dev?redirect=evil')).toBe(false);
  });

  it('abre externamente apenas URLs HTTP ou HTTPS fora da origem do aplicativo', () => {
    expect(isSafeExternalUrl('https://example.com/docs')).toBe(true);
    expect(isSafeExternalUrl('http://example.com/docs')).toBe(true);
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeExternalUrl('https://livechat.kaiangazineu.dev/chat')).toBe(false);
  });

  it('recusa credenciais embutidas e URLs inválidas', () => {
    expect(parsedHttpUrl('https://user:password@example.com')).toBeNull();
    expect(parsedHttpUrl('not a url')).toBeNull();
  });
});
