// GSM-7 basic set + extension table (extension chars cost 2 septets). Anything else => UCS-2.
const BASIC = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const EXT = "^{}\\[~]|€\f";
export interface SmsInfo { encoding: 'GSM-7' | 'UCS-2'; length: number; units: number; perSegment: number }
export function smsInfo(text: string): SmsInfo {
  let septets = 0, gsm = true;
  for (const ch of text) {
    if (BASIC.includes(ch)) septets += 1; else if (EXT.includes(ch)) septets += 2; else { gsm = false; break; }
  }
  if (gsm) {
    const units = septets === 0 ? 0 : septets <= 160 ? 1 : Math.ceil(septets / 153);
    return { encoding: 'GSM-7', length: septets, units, perSegment: units > 1 ? 153 : 160 };
  }
  const len = text.length; // UTF-16 code units (emoji = 2)
  const units = len === 0 ? 0 : len <= 70 ? 1 : Math.ceil(len / 67);
  return { encoding: 'UCS-2', length: len, units, perSegment: units > 1 ? 67 : 70 };
}
// Kenyan numbers -> 2547XXXXXXXX / 2541XXXXXXXX, else null
export function normalizeKenyanPhone(raw: string): string | null {
  const d = raw.replace(/[\s\-()]/g, '').replace(/^\+/, '');
  const m = d.match(/^(?:254|0)?([17]\d{8})$/);
  return m ? '254' + m[1] : null;
}
