// Usage: FRAME_CHECKS=1 npx tsx --env-file=.env.local scripts/eval/frame-checks-probe.ts  (SLUGS=, REPS=, R=)
// Free test: run ONLY the frame checks (no grading passes) on the reextracted
// frames, several times per fixture, and print what fired.
import fs from 'fs'
import { runFrameChecks, frameCheckBounds } from '../../lib/frame-checks'
const model = process.env.ANALYSIS_MODEL || 'qwen/qwen3.7-flash'
const R = Number(process.env.R || 18)   // reextract window is release-0.6s..+0.3s over 28 frames
const REPS = Number(process.env.REPS || 3)
const slugs = (process.env.SLUGS || 'shot-196,shot-202,shot-198,shot-206,shot-125').split(',')
async function main() {
  for (const slug of slugs) {
    const frames = Array.from({ length: 28 }, (_, i) => fs.readFileSync(`.eval-reextract/${slug}/${String(i).padStart(2, '0')}.jpg`).toString('base64'))
    const mimes = frames.map(() => 'image/jpeg')
    const results = await Promise.all(Array.from({ length: REPS }, () => runFrameChecks(frames, mimes, model, R)))
    for (const [i, fc] of results.entries()) {
      const e = fc.elbow
      const caps = frameCheckBounds(fc).map((b) => `${b.criterion.split(' ')[0]}:${b.cap !== undefined ? 'cap' + b.cap : 'floor' + b.floor}`).join(' ')
      console.log(`${slug} rep${i} crop=${fc.crop ? `${fc.crop.x0}-${fc.crop.x1}x${fc.crop.y0}-${fc.crop.y1}` : 'NONE'} catapult=${e?.catapult} v_top=${e?.v_top} v_throw=${e?.v_throw} flared=${e?.flared} elbow_out=${e?.elbow_out} clean=${e?.clean} n=${e?.answers} counts=${JSON.stringify(e?.counts)} | square=${JSON.stringify(fc.square)} | power=${JSON.stringify(fc.power)} | ${caps || '(no caps)'}`)
    }
  }
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1) })
