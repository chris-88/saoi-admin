/**
 * Fetches each market provider's logo (its site's touch icon or favicon) into
 * `public/logos/<provider>.png`, 64px on the long side, and lists the ones it has in
 * `src/admin/marketLogos.ts`, which the Market data cards read.
 *
 * The PNGs and the list are committed, so neither the build nor CI runs this, and the console
 * never requests anything from a provider's site: run it by hand when a provider is added.
 *
 *   npm run logos:fetch              # every provider
 *   npm run logos:fetch -- boi aib   # only these, keeping the rest of the list
 *
 * Needs `vips` (libvips; `pacman -S libvips`, `apt install libvips-tools`) to scale and convert.
 *
 * Some providers refuse automated requests at their edge; this asks once, honestly named,
 * after robots.txt, and never disguises the client to get past a refusal. A provider it cannot
 * read keeps no logo, and its card shows a monogram of its initials instead.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * Each provider id's public website: the list agreed on 2026-11-13, which the backend's
 * `PROVIDER_DOMAINS` (`supabase/functions/_shared/market/provider-names.ts` in `chris-88/saoi`,
 * sent as `providerDomain`) is being corrected to; four of its first domains did not resolve.
 * A bank sold through Raisin has its own site; `raisin` is the platform's mark, drawn on those
 * banks' logos. Null where there is no one site: the credit unions are many separate societies.
 */
const DOMAINS: Readonly<Record<string, string | null>> = {
  aib: 'aib.ie',
  boi: 'bankofireland.com',
  ptsb: 'permanenttsb.ie',
  ebs: 'ebs.ie',
  bunq: 'bunq.com',
  moco: 'moco.ie',
  revolut: 'revolut.com',
  an_post_money: 'anpost.com',
  avant_money: 'avantmoney.ie',
  credit_union: null,
  credit_union_mortgages: null,
  haven: 'havenmortgages.ie',
  ics_mortgages: 'icsmortgages.ie',
  nua_money: 'nuamoney.com',
  state_savings: 'statesavings.ie',
  bankinter: 'bankinter.com',
  raisin_bank: 'raisin.ie',
  banca_cf: 'bancacfplus.it',
  nordax: 'nordax.com',
  creditplus: 'creditplus.de',
  ibl_banca: 'iblbanca.it',
  aareal: 'aareal-bank.com',
  raisin: 'raisin.ie',
}

const USER_AGENT = 'saoi-admin-logos/1.0 (+https://admin.saoi.ie)'
const SIZE = 64
/** Smaller than this and a scaled-up favicon is a blur; the monogram reads better. */
const MIN_SOURCE_PX = 32

const OUT_DIR = resolve('public/logos')
const LIST = resolve('src/admin/marketLogos.ts')

type Fetched = { readonly url: string; readonly bytes: Uint8Array; readonly type: string }
/** An image file vips reads, or raw RGBA pixels (a bitmap inside an ICO). */
type Image =
  | { readonly kind: 'file'; readonly bytes: Uint8Array; readonly ext: string }
  | {
      readonly kind: 'rgba'
      readonly bytes: Uint8Array
      readonly width: number
      readonly height: number
    }

async function get(url: string): Promise<Fetched> {
  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: '*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`${String(response.status)} from ${url}`)
  return {
    url: response.url,
    bytes: new Uint8Array(await response.arrayBuffer()),
    type: response.headers.get('content-type') ?? '',
  }
}

/** RFC 9309, the part that matters here: the `*` group's (or ours) Disallow rules, by prefix. */
async function robotsAllow(origin: string, paths: readonly string[]): Promise<boolean> {
  let text: string
  try {
    text = new TextDecoder().decode((await get(`${origin}/robots.txt`)).bytes)
  } catch {
    return true // A missing or refused robots.txt is "no restrictions" (RFC 9309, 2.3.1.3).
  }
  const rules: string[] = []
  let applies = false
  let inAgents = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    const match = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line)
    if (match === null) continue
    const key = (match[1] ?? '').toLowerCase()
    const value = (match[2] ?? '').trim()
    if (key === 'user-agent') {
      if (!inAgents) applies = false
      inAgents = true
      if (value === '*' || USER_AGENT.toLowerCase().startsWith(value.toLowerCase())) applies = true
    } else {
      inAgents = false
      if (applies && key === 'disallow' && value !== '') rules.push(value)
    }
  }
  const blocked = (path: string) =>
    rules.some((rule) =>
      new RegExp(
        `^${rule
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*')
          .replace(/\\\$$/, '$')}`,
      ).test(path),
    )
  return paths.every((path) => !blocked(path))
}

/** The icons a page links, best first: touch icons, then the largest stated size. */
function linkedIcons(html: string, base: string): string[] {
  const found: { href: string; score: number }[] = []
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attr = (name: string) =>
      new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
        .exec(tag)
        ?.slice(1)
        .find((v) => v !== undefined)
    const rel = (attr('rel') ?? '').toLowerCase()
    const href = attr('href')
    if (href === undefined || !/\bicon\b|apple-touch-icon/.test(rel)) continue
    const size = Number(/(\d+)x\d+/.exec(attr('sizes') ?? '')?.[1] ?? 0)
    const touch = rel.includes('apple-touch-icon') ? 1000 : 0
    const svg = /\.svg(\?|$)/i.test(href) ? 500 : 0
    try {
      found.push({ href: new URL(href, base).href, score: touch + svg + size })
    } catch {
      // A malformed href: skip it.
    }
  }
  return found.sort((a, b) => b.score - a.score).map((icon) => icon.href)
}

const startsWith = (bytes: Uint8Array, prefix: readonly number[]) =>
  prefix.every((byte, index) => bytes[index] === byte)

/** An image vips can read: PNG, JPEG, GIF, WebP, SVG, or the largest entry of an ICO. */
function readable(fetched: Fetched): Image | null {
  const { bytes } = fetched
  const file = (ext: string): Image => ({ kind: 'file', bytes, ext })
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return file('png')
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return file('jpg')
  if (startsWith(bytes, [0x47, 0x49, 0x46])) return file('gif')
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46])) return file('webp')
  if (startsWith(bytes, [0x00, 0x00, 0x01, 0x00])) return largestInIco(bytes)
  const head = new TextDecoder().decode(bytes.slice(0, 512)).toLowerCase()
  if (fetched.type.includes('svg') || head.includes('<svg')) return file('svg')
  return null
}

/**
 * An ICO's largest entry: a PNG as it is, or a 32-bit bitmap (BGRA rows, bottom up) turned
 * into RGBA pixels. Bitmaps with a palette are left alone.
 */
function largestInIco(bytes: Uint8Array): Image | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const entries = Array.from({ length: view.getUint16(4, true) }, (_, i) => 6 + i * 16)
    .filter((at) => at + 16 <= bytes.length)
    .map((at) => ({
      size: view.getUint8(at) || 256,
      data: bytes.slice(
        view.getUint32(at + 12, true),
        view.getUint32(at + 12, true) + view.getUint32(at + 8, true),
      ),
    }))
    .sort((a, b) => b.size - a.size)
  for (const { data } of entries) {
    if (startsWith(data, [0x89, 0x50, 0x4e, 0x47])) return { kind: 'file', bytes: data, ext: 'png' }
    if (data.length < 40) continue
    const dib = new DataView(data.buffer, data.byteOffset, data.byteLength)
    const width = dib.getInt32(4, true)
    const height = dib.getInt32(8, true) / 2
    if (dib.getUint32(0, true) !== 40 || dib.getUint16(14, true) !== 32) continue
    if (data.length < 40 + width * height * 4) continue
    const rgba = new Uint8Array(width * height * 4)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const from = 40 + ((height - 1 - y) * width + x) * 4
        const to = (y * width + x) * 4
        rgba[to] = data[from + 2] ?? 0
        rgba[to + 1] = data[from + 1] ?? 0
        rgba[to + 2] = data[from] ?? 0
        rgba[to + 3] = data[from + 3] ?? 0
      }
    }
    return { kind: 'rgba', bytes: rgba, width, height }
  }
  return null
}

/** libvips, quiet: it warns on stderr about optional modules this script never needs. */
function run(command: 'vips' | 'vipsheader', args: readonly string[]): string {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

/** Scales an icon to SIZE on its long side, as PNG; refuses one too small to scale up. */
function toPng(image: Image, out: string, work: string): void {
  let input: string
  if (image.kind === 'rgba') {
    const raw = join(work, 'in.raw')
    writeFileSync(raw, image.bytes)
    input = join(work, 'in.png')
    run('vips', ['rawload', raw, input, String(image.width), String(image.height), '4'])
  } else {
    input = join(work, `in.${image.ext}`)
    writeFileSync(input, image.bytes)
  }
  if (image.kind === 'rgba' || image.ext !== 'svg') {
    const width = Number(run('vipsheader', ['-f', 'width', input]))
    if (width < MIN_SOURCE_PX) throw new Error(`only ${String(width)}px`)
  }
  run('vips', ['thumbnail', input, out, String(SIZE), '--height', String(SIZE)])
}

async function logoFor(id: string, domain: string, work: string): Promise<string> {
  if (!(await robotsAllow(`https://${domain}`, ['/']))) {
    throw new Error(`robots.txt at ${domain} disallows it`)
  }
  const home = await get(`https://${domain}/`).catch((error: unknown) => {
    throw new Error(`home page: ${error instanceof Error ? error.message : String(error)}`)
  })
  const origin = new URL(home.url).origin
  const html = new TextDecoder().decode(home.bytes)
  const candidates = [
    ...linkedIcons(html, home.url),
    `${origin}/apple-touch-icon.png`,
    `${origin}/favicon.ico`,
  ].filter((url, index, all) => all.indexOf(url) === index)
  const sameSite = candidates.filter((url) => new URL(url).origin === origin)
  if (!(await robotsAllow(origin, ['/', ...sameSite.map((url) => new URL(url).pathname)]))) {
    throw new Error(`robots.txt at ${origin} disallows it`)
  }
  const reasons: string[] = []
  for (const url of candidates) {
    try {
      const image = readable(await get(url))
      if (image === null) throw new Error('not an image vips reads')
      toPng(image, join(OUT_DIR, `${id}.png`), work)
      return url
    } catch (error) {
      reasons.push(`${url}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  throw new Error(reasons.join('; ') || 'no icon linked')
}

const only = process.argv.slice(2)
const ids = Object.keys(DOMAINS).filter((id) => only.length === 0 || only.includes(id))
const unknown = only.filter((id) => !(id in DOMAINS))
if (unknown.length > 0) throw new Error(`Unknown provider ids: ${unknown.join(', ')}`)

mkdirSync(OUT_DIR, { recursive: true })
const previous = new Set<string>(
  only.length === 0
    ? []
    : [...readFileSync(LIST, 'utf8').matchAll(/^ {2}'([a-z0-9_]+)',$/gm)]
        .map((match) => match[1] ?? '')
        .filter((id) => id !== '' && !only.includes(id)),
)
const work = mkdtempSync(join(tmpdir(), 'saoi-logos-'))
const fetched: string[] = []
const failed: string[] = []
try {
  for (const id of ids) {
    const domain = DOMAINS[id] ?? null
    if (domain === null) {
      failed.push(`${id}: no single website recorded`)
      continue
    }
    try {
      const url = await logoFor(id, domain, work)
      fetched.push(id)
      console.log(`ok      ${id} from ${url}`)
    } catch (error) {
      rmSync(join(OUT_DIR, `${id}.png`), { force: true })
      failed.push(`${id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}
for (const line of failed) console.log(`MISSING ${line}`)

const logos = [...new Set([...previous, ...fetched])].sort()
writeFileSync(
  LIST,
  [
    '// Generated by `npm run logos:fetch` (scripts/fetch-logos.ts): the provider ids with a logo in',
    '// public/logos/. Do not edit by hand.',
    'export const MARKET_LOGOS: readonly string[] = [',
    ...logos.map((id) => `  '${id}',`),
    ']',
    '',
  ].join('\n'),
)
console.log(`${String(fetched.length)} fetched, ${String(failed.length)} without a logo.`)
