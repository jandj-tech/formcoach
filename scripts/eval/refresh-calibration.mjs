// Mints a new frozen calibration version from accumulated admin corrections.
//
// Admin corrections no longer change the grader live — they accumulate until
// this script bundles them into a new grader_calibration row, and the grader
// only changes when that row is ACTIVATED. Rollback = re-activate an older
// version.
//
// Usage:
//   npm run calibration:refresh                          create a draft (inactive) version + show diff vs active
//   npm run calibration:refresh -- --activate            create AND activate (run `npm run eval` first!)
//   npm run calibration:refresh -- --activate-version 3  activate an existing version (rollback), no new version minted
import postgres from 'postgres'

const args = process.argv.slice(2)
const ACTIVATE = args.includes('--activate')
const avIdx = args.indexOf('--activate-version')
const ACTIVATE_VERSION = avIdx !== -1 ? parseInt(args[avIdx + 1], 10) : null

const db = postgres(process.env.DATABASE_URL, { ssl: 'require' })

async function activate(version) {
  await db.begin(async (tx) => {
    const rows = await tx`UPDATE grader_calibration SET active = false WHERE active = true RETURNING version`
    const updated = await tx`UPDATE grader_calibration SET active = true WHERE version = ${version} RETURNING version`
    if (updated.length === 0) throw new Error(`version ${version} does not exist`)
    console.log(
      rows.length > 0
        ? `Deactivated v${rows[0].version}, activated v${version}.`
        : `Activated v${version} (no version was active before).`
    )
  })
}

if (ACTIVATE_VERSION !== null) {
  if (!Number.isInteger(ACTIVATE_VERSION)) {
    console.error('--activate-version needs an integer version number')
    process.exit(1)
  }
  await activate(ACTIVATE_VERSION)
  console.log('Grader calibration switched. Run `npm run eval` to measure the effect.')
  await db.end()
  process.exit(0)
}

// Render the block with the exact same code the grader's live fallback uses,
// so freezing is a pure snapshot, never a reformat.
const { buildCalibrationFeedbackText } = await import('../../lib/analyze.ts')
const content = await buildCalibrationFeedbackText()

const [active] = await db`
  SELECT version, content FROM grader_calibration WHERE active = true ORDER BY version DESC LIMIT 1
`

if (active && active.content === content) {
  console.log(`No change: corrections since v${active.version} do not alter the calibration block.`)
  await db.end()
  process.exit(0)
}

const [{ next }] = await db`
  SELECT COALESCE(MAX(version), 0) + 1 AS next FROM grader_calibration
`
const version = Number(next)
await db`
  INSERT INTO grader_calibration (version, content, active) VALUES (${version}, ${content}, false)
`
console.log(`Minted calibration v${version} (inactive)${content === '' ? ' — empty block (no corrections with notes)' : ''}.`)

console.log('\n===== ACTIVE (v' + (active?.version ?? 'none — live fallback in use') + ') =====')
console.log(active?.content || '(empty)')
console.log('\n===== NEW (v' + version + ') =====')
console.log(content || '(empty)')

if (ACTIVATE) {
  await activate(version)
  console.log('\nActivated. Run `npm run eval` and compare against the baseline; if grading drifted badly:')
  console.log(`  npm run calibration:refresh -- --activate-version ${active?.version ?? '<previous>'}`)
} else {
  console.log(`\nDraft only. To measure and adopt it:`)
  console.log(`  1. npm run calibration:refresh -- --activate-version ${version}`)
  console.log(`  2. npm run eval    (review drift vs baseline)`)
  console.log(`  3. keep it (npm run eval -- --accept) or roll back (--activate-version ${active?.version ?? '<previous>'})`)
}
await db.end()
process.exit(0)
