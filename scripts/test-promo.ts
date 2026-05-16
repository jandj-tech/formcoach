// One-off: sends the biweekly promo email to a SINGLE address so you can
// preview it without emailing the whole list.
//   npx tsx --env-file=.env.local scripts/test-promo.ts you@example.com
import { sendPromoEmail } from '../lib/email'

async function main() {
  const to = process.argv[2]
  if (!to) {
    console.error('Usage: npx tsx --env-file=.env.local scripts/test-promo.ts <email>')
    process.exit(1)
  }
  console.log(`Sending test promo email to ${to} ...`)
  await sendPromoEmail(to)
  console.log('Done — check that inbox (and the spam folder).')
}

main().catch((err) => {
  console.error('Failed:', err)
  process.exit(1)
})
