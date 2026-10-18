import { describe, it, expect } from 'vitest';
import { smsInfo, normalizeKenyanPhone } from '../src/sms/units';
describe('smsInfo', () => {
  it('160 GSM chars = 1 unit', () => expect(smsInfo('a'.repeat(160)).units).toBe(1));
  it('161 GSM chars = 2 units (153 each)', () => expect(smsInfo('a'.repeat(161)).units).toBe(2));
  it('306 chars = 2, 307 = 3', () => { expect(smsInfo('a'.repeat(306)).units).toBe(2); expect(smsInfo('a'.repeat(307)).units).toBe(3); });
  it('extension chars count double', () => expect(smsInfo('€'.repeat(81)).units).toBe(2));
  it('unicode: 70 = 1, 71 = 2', () => { expect(smsInfo('ā'.repeat(70)).units).toBe(1); expect(smsInfo('ā'.repeat(71)).units).toBe(2); });
  it('emoji switches to UCS-2', () => expect(smsInfo('hi 😀').encoding).toBe('UCS-2'));
});
describe('phones', () => {
  it('normalizes', () => { expect(normalizeKenyanPhone('0712 345 678')).toBe('254712345678'); expect(normalizeKenyanPhone('+254112345678')).toBe('254112345678'); });
  it('rejects bad', () => expect(normalizeKenyanPhone('12345')).toBeNull());
});
