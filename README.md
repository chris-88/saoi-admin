# saoi-admin

The presenter console for Saoi, live at [admin.saoi.ie](https://admin.saoi.ie) behind an
administrator sign-in. Saoi is a conversational orchestration layer over simulated retail banking
product journeys for a fictional Demo Bank; this console inspects conversations, moves the bank's
side of an application, sends notifications and tunes Saoirse's persona. It is a proof of concept,
not a bank: nothing in it is real.

| Repo                                                                | What                                                          |
| ------------------------------------------------------------------- | ------------------------------------------------------------- |
| [chris-88/saoi](https://github.com/chris-88/saoi)                   | the backend (`saoi-api`, schema, domain) and the product docs |
| [chris-88/saoi-web](https://github.com/chris-88/saoi-web)           | the Saoirse chat, [app.saoi.ie](https://app.saoi.ie)          |
| [chris-88/saoi-showcase](https://github.com/chris-88/saoi-showcase) | the showcase, [showcase.saoi.ie](https://showcase.saoi.ie)    |

## Setup

```sh
git clone https://github.com/chris-88/saoi-admin.git
cd saoi-admin
nvm use
npm ci
cp .env.example .env     # the VITE_* values; none of them is secret
npm run dev              # http://localhost:5174
```

## Commands

| Command                               | What it does                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| `npm run check`                       | Typecheck, lint, format check, test, build, secret scan                              |
| `npm run dev`                         | Vite dev server on 5174                                                              |
| `npm test`                            | Vitest                                                                               |
| `npm run e2e`                         | Playwright smoke checks                                                              |
| `npm run api:generate`                | Regenerate the typed API client's schema from `https://api.saoi.ie/api/openapi.json` |
| `npm run shared:sync`, `shared:check` | Refresh, or check, the contracts copied from `../saoi`                               |

## Licence

AGPL-3.0-only. See [LICENSE](LICENSE).
