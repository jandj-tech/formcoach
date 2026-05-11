const postgres = require('postgres')
const https = require('https')
require('dotenv').config({ path: '.env.local' })

function fetchAsBase64(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks).toString('base64')))
      res.on('error', reject)
    }).on('error', reject)
  })
}

async function main() {
  const db = postgres(process.env.DATABASE_URL, { ssl: 'require' })

  // Get the 2 most recent submissions with frame URLs
  const rows = await db`
    SELECT s.id as sub_id, a.id as analysis_id, a.frame_urls, s.created_at
    FROM submissions s JOIN analyses a ON a.submission_id = s.id
    WHERE array_length(a.frame_urls, 1) = 20
    ORDER BY s.created_at DESC LIMIT 2
  `

  for (const row of rows) {
    console.log(`\n=== Analysis ${row.analysis_id} (${new Date(row.created_at).toLocaleTimeString()}) ===`)
    console.log('Downloading', row.frame_urls.length, 'frames...')
    
    const base64Frames = []
    for (let i = 0; i < row.frame_urls.length; i++) {
      process.stdout.write(`\r  Frame ${i+1}/${row.frame_urls.length}`)
      base64Frames.push(await fetchAsBase64(row.frame_urls[i]))
    }
    console.log('\n  Downloaded. Running analysis...')

    const mimeTypes = base64Frames.map(() => 'image/jpeg')
    
    // Dynamically import analyzeShot
    const mod = await import('./lib/analyze.ts')
    const analyzeShot = mod.analyzeShot || mod.default?.analyzeShot
    const result = await analyzeShot(base64Frames, mimeTypes)
    
    console.log(`Overall: ${result.overall_score}`)
    for (const c of result.criteria) {
      console.log(`  ID ${c.id}: ${c.score ?? 'null'} — ${c.reasoning?.slice(0, 80)}`)
    }
  }

  await db.end()
}
main().catch(console.error)
