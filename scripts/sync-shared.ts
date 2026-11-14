/**
 * Copies the shared contracts and domain files this app uses from a `chris-88/saoi` checkout.
 *
 * `src/shared/` is a copy, not a package: the backend owns these files
 * (`supabase/functions/_shared/` in `chris-88/saoi`) and this app takes the ones it imports.
 * The list below is exactly those, so a new import of a shared file is added here too.
 *
 *   npm run shared:sync              # copy from ../saoi (or SAOI_DIR)
 *   npm run shared:check             # exit 1 if any copy differs from the checkout
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const FILES = [
  'contracts/admin.ts',
  'contracts/catalogue.ts',
  'contracts/market.ts',
  'contracts/telemetry.ts',
  'domain/case.ts',
  'domain/catalogue/overlay.ts',
  'domain/facts.ts',
  'domain/goals/catalogue.ts',
  'domain/goals/clusters.ts',
  'domain/goals/types.ts',
  'domain/insights.ts',
  'domain/journey.ts',
  'domain/needs/catalogue.ts',
  'domain/needs/types.ts',
  'domain/plans/types.ts',
  'domain/state-machine.ts',
  'llm/persona.ts',
  'market/schema.ts',
  'llm/refusals.ts',
  'tenants/demo/domain-config.ts',
] as const

const saoi = resolve(process.env.SAOI_DIR ?? '../saoi')
const source = join(saoi, 'supabase/functions/_shared')
const target = resolve('src/shared')
const check = process.argv.includes('check')

if (!existsSync(source)) {
  console.error(`No ${source}. Set SAOI_DIR to a chris-88/saoi checkout.`)
  process.exit(1)
}

let drift = 0
for (const file of FILES) {
  const from = join(source, file)
  const to = join(target, file)
  if (check) {
    const same = existsSync(to) && readFileSync(from, 'utf8') === readFileSync(to, 'utf8')
    if (!same) {
      console.error(`differs: src/shared/${file}`)
      drift++
    }
  } else {
    mkdirSync(dirname(to), { recursive: true })
    copyFileSync(from, to)
  }
}

if (check && drift > 0) process.exit(1)
console.log(check ? 'src/shared matches the saoi checkout.' : `Copied ${FILES.length} files.`)
