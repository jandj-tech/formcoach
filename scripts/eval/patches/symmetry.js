// Make the burden of proof SYMMETRIC.  node scripts/eval/patches/symmetry.js [--revert]
//
// WHY. Measured on 116 expert-labelled cells: where the owner scored a shot BAD
// the grader averaged 5.9 against his 3.5 — a +2.5 gap with 9 of 9 misses too
// HIGH and none too low — while on shots he scored GOOD it sat within 0.3. The
// grader is not noisy, it is blind to faults, and it then writes the fault up as
// correct form.
//
// The mechanism is an asymmetry in this prompt: three rules guard against
// inventing a FAULT (burden of proof, the mandatory 10, the consistency check)
// and nothing anywhere guards against inventing CORRECTNESS. On a good shot that
// costs nothing. On a bad shot it costs everything, and a coaching product that
// tells a player with a real flaw that their form is fine has failed at its only
// job.
//
// This does NOT license inventing faults — it makes the TOP of the scale require
// the same standard of evidence a deduction already requires.
const fs = require('fs')
const revert = process.argv.includes('--revert')
const p = 'lib/analyze.ts'
let s = fs.readFileSync(p, 'utf8')

const OLD = `MANDATORY 10 RULE: If you cannot name a specific visible flaw, the score is 10 — not 9 "to be safe," not 9.5. A score below 10 requires you to state exactly what was wrong. Never give 9 as a hedge when everything looks correct. 9 means you saw one small specific thing off; if you didn't see that thing, the score is 10.`

const NEW = `THE TOP OF THE SCALE IS A CLAIM, AND IT NEEDS EVIDENCE TOO. A deduction requires you to name the flaw you saw. Full marks require the same in reverse: name the correct mechanic you actually WATCHED. "I could not find anything wrong" and "I saw it done correctly" are different statements, and only the second earns the top of the range.

So there are three outcomes, not two:
- You looked at what this criterion asks about and it was CORRECT — name what you saw, score the top of the range.
- You looked and found a FLAW — name it, score it by the criterion's anchors.
- You could not get a proper look — say so, set evidence to "partial" or "none", and score the middle of the range. A failed look is not a pass.

DO NOT HEDGE EITHER. Having seen the mechanic clearly and correctly, do not shave to a 9 "to be safe" — that is the opposite error and also wrong. A 9 means you saw one small specific thing off and can say what it was.

WHY THIS IS SPELLED OUT: measured against the owner's own grades, on shots he scored between 2 and 5 this grader averaged 5.9 where he averaged 3.5 — every single miss too HIGH, by 2.5 points on average — while on shots he scored 8 or better it was within 0.3. The faults were not being invented, they were being MISSED and then written up as correct form. That cost lands entirely on the players whose shots most need fixing.`

const from = revert ? NEW : OLD
const to = revert ? OLD : NEW
if (!s.includes(from)) { console.error('ANCHOR MISSING — already ' + (revert ? 'reverted' : 'applied') + '?'); process.exit(1) }
fs.writeFileSync(p, s.replace(from, to))
console.log(revert ? 'symmetric burden of proof REVERTED' : 'symmetric burden of proof APPLIED')
