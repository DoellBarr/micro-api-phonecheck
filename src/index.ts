import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import * as ct from 'countries-and-timezones';

type TZInfo = { timeZone: string; rawOffsetMin?: number; dstOffsetMin?: number; hasDst?: boolean };

// ————————————————————————————————
// Minimal logging (non-PII): no-op in prod
const log = (..._args: any[]) => { /* no-op */ };

// Extract phone from GET ?phone=... or POST { phone }
async function getPhone(req: Request): Promise<{ phone: string | null; verbose: boolean }> {
  const url = new URL(req.url);
  const verbose = url.searchParams.get('verbose') === '1';
  if (req.method === 'GET') {
    return { phone: url.searchParams.get('phone'), verbose };
  }
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      return { phone: body?.phone ?? null, verbose };
    } catch {
      return { phone: null, verbose };
    }
  }
  return { phone: null, verbose };
}

function json(data: any, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
      ...extraHeaders
    }
  });
}

function getTimezonesByCountry(iso2?: string): TZInfo[] {
  if (!iso2) return [];
  const country = ct.getCountry(iso2);
  if (!country) return [];
  const uniq = new Map<string, TZInfo>();
  const tzList = (country as any).timezones || [];
  for (const entry of tzList as string[]) {
    const tzName = typeof entry === 'string' ? entry : (entry as any)?.name;
    if (!tzName) continue;
    const z = ct.getTimezone(tzName);
    uniq.set(tzName, {
      timeZone: tzName,
      rawOffsetMin: z?.utcOffset,
      dstOffsetMin: z?.dstOffset,
      hasDst: Boolean(z?.dstOffset && z?.dstOffset !== z?.utcOffset),
    });
  }
  return Array.from(uniq.values());
}

// Optional: small NANP area code -> timezone map. Extend as needed.
const NANP_TZ_BY_AREACODE: Record<string, string> = {
  '212': 'America/New_York', '315': 'America/New_York', '347': 'America/New_York',
  '310': 'America/Los_Angeles', '424': 'America/Los_Angeles', '702': 'America/Los_Angeles',
  '312': 'America/Chicago', '214': 'America/Chicago',
  '602': 'America/Denver', '480': 'America/Denver',
  '416': 'America/Toronto', '647': 'America/Toronto',
  '604': 'America/Vancouver', '778': 'America/Vancouver',
};

function bestGuess(iso2?: string, national?: string, tzs: TZInfo[] = []): string | null {
  if (!iso2) return null;
  if (tzs.length === 1) return tzs[0].timeZone;

  // Extra precision for US/CA using area code
  if ((iso2 === 'US' || iso2 === 'CA') && national && national.length >= 10) {
    const ac = national.slice(0, 3);
    if (NANP_TZ_BY_AREACODE[ac]) return NANP_TZ_BY_AREACODE[ac];
  }
  return tzs[0]?.timeZone || null;
}

export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') return json({ ok: true }); // CORS preflight

    const url = new URL(req.url);
    if (url.pathname === '/' || url.pathname === '/health') {
      return json({ ok: true, name: 'phone-to-timezone', version: '1.0.0' });
    }

    if (url.pathname === '/api/timezone') {
      const { phone, verbose } = await getPhone(req);
      if (!phone) return json({ error: 'Missing "phone"' }, 400);

      // Normalize: add '+' if missing
      const normalized = phone.startsWith('+') ? phone : `+${phone.replace(/^\+?/, '')}`;

      const p = parsePhoneNumberFromString(normalized);
      if (!p || !p.isValid()) {
        return json({ valid: false, iana_timezone: null, country: null, note: 'Invalid phone number' }, 200);
      }

      const iso2 = p.country;               // e.g. 'ID'
      const national = p.nationalNumber;    // e.g. '0812...'
      const tzs = getTimezonesByCountry(iso2);
      const guess = bestGuess(iso2, national, tzs);

      const payload: any = {
        valid: true,
        iana_timezone: guess || 'UTC',
        country: iso2 || null,
        Phone: p.number
      };

      if (verbose) {
        payload.meta = {
          e164: p.number,
          countryName: iso2 ? ct.getCountry(iso2)?.name || null : null,
          possibleTimezones: tzs,
        };
      }
      return json(payload, 200);
    }

    return json({ error: 'Not found' }, 404);
  }
};
