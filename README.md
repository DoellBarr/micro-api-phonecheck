# phone-to-timezone (Cloudflare Workers)

Micro-API: convert **phone number -> IANA timezone (bestGuess)** + country.
- Input minimal: **phone** (GET `?phone=` or POST `{ "phone": "..." }`)
- All parsing & mapping handled server-side with `libphonenumber-js` + `countries-and-timezones`

## Endpoints

- `GET /health` → health check
- `GET /api/timezone?phone=%2B6281234567890` → minimal output
- `GET /api/timezone?phone=%2B12125551234&verbose=1` → verbose (candidates + metadata)
- `POST /api/timezone` body: `{ "phone": "+6281234567890" }`

### Response (minimal)
```json
{
  "valid": true,
  "iana_timezone": "Asia/Jakarta",
  "country": "ID"
}
```

### Response (verbose)
```json
{
  "valid": true,
  "iana_timezone": "America/New_York",
  "country": "US",
  "meta": {
    "e164": "+12125551234",
    "countryName": "United States",
    "possibleTimezones": [
      { "timeZone": "America/New_York", "rawOffsetMin": -300, "dstOffsetMin": -240, "hasDst": true },
      { "timeZone": "America/Chicago", "rawOffsetMin": -360, "dstOffsetMin": -300, "hasDst": true }
    ]
  }
}
```

> Note: Some countries have multiple time zones (US/CA/AU/BR/RU...). For +1 NANP numbers,
> a small area-code mapping heuristic is applied; extend `NANP_TZ_BY_AREACODE` for better accuracy.

## Quick Start (Cloudflare Workers)

```bash
# 1) Install deps
npm i

# 2) Login once
npx wrangler login

# 3) Dev locally
npm run dev

# 4) Deploy
npm run deploy
```

Your endpoint will be available at:
```
https://<your-worker>.workers.dev/api/timezone?phone=%2B6281234567890
```

## Use from n8n Cloud

**HTTP Request node** → GET
- URL: `https://<your-worker>.workers.dev/api/timezone`
- Query:
  - `phone`: `{{$json.phone}}`
  - (optional) `verbose`: `1`

Then pick `{{$json.iana_timezone}}` for downstream logic.

## Licensing

MIT. See [LICENSE](./LICENSE).