// Diagnostic: lists the domains visible to the current RESEND_API_KEY.
//   npx tsx --env-file=.env.local scripts/check-resend.ts
async function main() {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.error('RESEND_API_KEY is not set in .env.local')
    process.exit(1)
  }
  console.log('Using API key:', key.slice(0, 8) + '…' + key.slice(-4))
  const res = await fetch('https://api.resend.com/domains', {
    headers: { Authorization: `Bearer ${key}` },
  })
  const body = await res.json()
  console.log('Status:', res.status)
  console.log('Domains for this key:', JSON.stringify(body, null, 2))
}

main().catch((e) => {
  console.error('Failed:', e)
  process.exit(1)
})
