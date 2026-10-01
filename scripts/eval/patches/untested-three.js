// Reverts the three changes that were APPLIED BUT NEVER MEASURED, so they can be
// tested as a group:  evidence field, grounding, off-frame reference.
//
// All three went in during a session whose arms were lost when /tmp was cleared,
// so they sit inside the current 38.8% baseline on faith rather than evidence.
// Given that three LATER interventions with the same "make the model scrutinise
// itself" shape all made things worse, these need checking rather than trusting.
//
// Apply (=revert them):  node scripts/eval/patches/untested-three.js
// Undo   (=restore them): node scripts/eval/patches/untested-three.js --restore
const fs = require('fs')
const restore = process.argv.includes('--restore')
const p = 'lib/analyze.ts'
let s = fs.readFileSync(p, 'utf8')

// --- 1. evidence field instruction -----------------------------------------
const EVIDENCE_ON = `BURDEN OF PROOF — deductions require evidence of a visible flaw: You need to clearly see something wrong to deduct points. Not being able to perfectly confirm something is correct is NOT a flaw. Only deduct when you can describe the specific flaw you observed.

REPORT YOUR EVIDENCE FOR EVERY CRITERION.`
const EVIDENCE_OFF = `BURDEN OF PROOF — deductions require evidence of a visible flaw: You need to clearly see something wrong to deduct points. Not being able to perfectly confirm something is correct is NOT a flaw. Default to full credit; only deduct when you can describe the specific flaw you observed.

DISABLED_EVIDENCE_BLOCK.`

// The evidence block runs to the next all-caps heading; cut it wholesale.
function stripEvidence(text) {
  const start = text.indexOf('REPORT YOUR EVIDENCE FOR EVERY CRITERION.')
  if (start === -1) return null
  const end = text.indexOf('SET POINT ABOVE OR BEHIND THE HEAD', start)
  if (end === -1) return null
  return text.slice(0, start) + text.slice(end)
}

if (!restore) {
  const stripped = stripEvidence(s)
  if (stripped === null) { console.error('evidence block not found (already reverted?)'); process.exit(1) }
  s = stripped
  s = s.replace(
    'Only deduct when you can describe the specific flaw you observed.',
    'Default to full credit; only deduct when you can describe the specific flaw you observed.'
  )
  // grounding -> original consistency check
  const GROUND_START = 'A POSITIVE CLAIM NEEDS A NAMED OBSERVABLE.'
  const gi = s.indexOf(GROUND_START)
  if (gi !== -1) {
    const gEnd = s.indexOf('USER-FACING LANGUAGE RULE:', gi)
    s = s.slice(0, gi) +
      'CONSISTENCY CHECK (apply before finalizing every score): If your reasoning for a criterion describes good mechanics, no flaws, or nothing wrong — the score MUST be 10. A positive or neutral reasoning combined with a score below 10 is a direct contradiction. Fix the score to 10, not the reasoning.\n\n' +
      s.slice(gEnd)
  }
  // off-frame reference guidance
  const OFF_START = '- WHERE THE TARGET IS, FOR ANY CRITERION THAT MENTIONS THE BASKET OR THE RIM:'
  const oi = s.indexOf(OFF_START)
  if (oi !== -1) {
    const oEnd = s.indexOf('\n- Stance:', oi)
    s = s.slice(0, oi) + s.slice(oEnd + 1)
  }
  fs.writeFileSync(p, s)
  console.log('REVERTED: evidence field, grounding, off-frame reference')
  console.log('(git checkout lib/analyze.ts is NOT safe here — other kept changes live in this file)')
} else {
  console.error('--restore is not implemented; use git diff to bring them back deliberately')
  process.exit(1)
}
