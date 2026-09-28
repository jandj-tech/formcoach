// Which measurable properties of a cell predict whether it misses?
//
// The brief asked to "learn what predicts a miss". Each factor below is tested
// against the same dump, so they are directly comparable rather than each being
// argued from a different arm.
import { readFileSync, existsSync } from 'fs'
import { createHash } from 'crypto'
const { default: sharp } = await import('sharp')
const { db } = await import('../../lib/db.ts')

const TOL = 0.3
const ABST = new Set(['Two Finger Release', 'Shot Arc', 'Ball Rotation'])
const dump = JSON.parse(readFileSync(process.argv[2] ?? '/tmp/bias/nosquare.json', 'utf8'))
const err = (c) => (c.score < c.expected[0] ? c.score - c.expected[0] : c.score > c.expected[1] ? c.score - c.expected[1] : 0)

// --- per-fixture properties -------------------------------------------------
const CACHE = '.eval-frame-cache'
const pathFor = (u) => `${CACHE}/${createHash('sha256').update(u).digest('hex')}.b64`
const boxes = existsSync('scripts/eval/crop-boxes.json')
  ? JSON.parse(readFileSync('scripts/eval/crop-boxes.json', 'utf8')) : {}
const fx = await db`SELECT slug, frame_urls FROM eval_fixtures WHERE active = true`
const crit = await db`SELECT name, weight, grading_notes FROM criteria WHERE active = true`
await db.end()
const W = new Map(crit.map((c) => [c.name, { w: Number(c.weight), notes: (c.grading_notes ?? '').length }]))

const fxProps = {}
for (const f of fx) {
  const urls = f.frame_urls ?? []
  let shortEdge = null, aspect = null
  for (const u of urls.slice(0, 2)) {
    if (!existsSync(pathFor(u))) continue
    const m = await sharp(Buffer.from(readFileSync(pathFor(u), 'utf8'), 'base64')).metadata()
    if (m.width && m.height) { shortEdge = Math.min(m.width, m.height); aspect = m.height / m.width; break }
  }
  const b = boxes[f.slug]
  const area = b && !b.skip ? (b.x1 - b.x0) * (b.y1 - b.y0) : null
  fxProps[f.slug] = { shortEdge, aspect, playerArea: area }
}

// --- build the cell table ---------------------------------------------------
const cells = dump.cells
  .filter((c) => c.source === 'expert' && !ABST.has(c.criterion) && Array.isArray(c.expected) && c.score != null)
  .map((c) => {
    const p = fxProps[c.fixture] ?? {}
    return {
      missed: Math.abs(err(c)) > TOL ? 1 : 0,
      bandWidth: c.expected[1] - c.expected[0],
      bandMid: (c.expected[0] + c.expected[1]) / 2,
      bandTouchesTop: c.expected[1] >= 9.5 ? 1 : 0,
      weight: W.get(c.criterion)?.w ?? 1,
      rubricChars: W.get(c.criterion)?.notes ?? 0,
      shortEdge: p.shortEdge ?? null,
      portrait: p.aspect != null ? (p.aspect > 1 ? 1 : 0) : null,
      playerArea: p.playerArea ?? null,
    }
  })

const pointBiserial = (xs, ys) => {
  const pairs = xs.map((x, i) => [x, ys[i]]).filter(([x]) => x != null)
  const n = pairs.length
  if (n < 6) return { r: NaN, n }
  const mx = pairs.reduce((a, [x]) => a + x, 0) / n
  const my = pairs.reduce((a, [, y]) => a + y, 0) / n
  let sxy = 0, sxx = 0, syy = 0
  for (const [x, y] of pairs) { const a = x - mx, b = y - my; sxy += a * b; sxx += a * a; syy += b * b }
  const r = sxx === 0 || syy === 0 ? NaN : sxy / Math.sqrt(sxx * syy)
  // two-sided t test on r
  const t = Math.abs(r) * Math.sqrt((n - 2) / (1 - r * r))
  const p = 2 * (1 - (1 - 0.5 * Math.exp(-0.717 * t - 0.416 * t * t)))
  return { r, n, p: Math.max(0, Math.min(1, p)) }
}

const factors = ['bandWidth', 'bandMid', 'bandTouchesTop', 'weight', 'rubricChars', 'shortEdge', 'portrait', 'playerArea']
console.log(`WHAT PREDICTS A MISS?   ${cells.length} cells, ${cells.filter(c => c.missed).length} missed\n`)
console.log('factor'.padEnd(17) + 'n'.padStart(4) + '   r vs miss'.padStart(12) + '   p'.padStart(8) + '   reading')
const out = []
for (const f of factors) {
  const { r, n, p } = pointBiserial(cells.map((c) => c[f]), cells.map((c) => c.missed))
  if (isNaN(r)) { console.log('  ' + f.padEnd(15) + String(n).padStart(4) + '        n/a'); continue }
  out.push({ f, r, p, n })
}
out.sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
for (const { f, r, p, n } of out) {
  const sig = p < 0.01 ? '***' : p < 0.05 ? '**' : p < 0.15 ? '*' : ''
  console.log('  ' + f.padEnd(15) + String(n).padStart(4) + '   ' + ((r >= 0 ? '+' : '') + r.toFixed(3)).padStart(9) +
    '   ' + p.toFixed(3).padStart(6) + '   ' + sig + (Math.abs(r) > 0.15 ? (r > 0 ? '  higher -> MORE misses' : '  higher -> FEWER misses') : ''))
}
// band width is the one the metric itself controls — show it as a table too
console.log('\nMISS RATE BY EXPERT BAND WIDTH (the tolerance the expert allowed):')
const byW = {}
for (const c of cells) { const k = c.bandWidth.toFixed(1); (byW[k] ??= { n: 0, m: 0 }); byW[k].n++; byW[k].m += c.missed }
for (const k of Object.keys(byW).sort((a, b) => a - b))
  console.log(`  band width ${k}:  ${byW[k].m}/${byW[k].n} = ${(100 * byW[k].m / byW[k].n).toFixed(0)}%`)
