/**
 * Proves every vision call in the pipeline follows ANALYSIS_MODEL.
 *
 * THE BUG THIS GUARDS: ANALYSIS_MODEL used to switch only the grading call.
 * The release gate handed the gateway model id straight to Anthropic (which
 * rejects it) and both /api/detect-shot-* routes had claude-sonnet-4-6
 * hardcoded. Three of the four vision calls silently stayed on the old
 * provider — which on an Anthropic account with no credits is a dead pipeline,
 * not a cheaper one. "It graded one shot" would not have caught that, because
 * the detect calls fail soft and the gate's failure looks like a bad clip.
 *
 * Phase 1 needs no network and no credentials: it intercepts fetch and the
 * Anthropic SDK and asserts WHERE each call would have gone.
 * Phase 2 runs only with OPENROUTER_API_KEY set, and makes one real call.
 *
 *   npx tsx --env-file=.env.local scripts/eval/test-provider-routing.ts
 */
import { isGatewayModel, analysisModel, detectModel, callVisionModel } from '../../lib/model-provider'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// A 1x1 black JPEG. Real bytes, so a provider that validates images accepts it.
const TINY_JPEG =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAA' +
  'AQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIh' +
  'MUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpT' +
  'VFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5' +
  'usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iii' +
  'gD//2Q=='

async function main() {
  console.log('\n=== Phase 1: routing (no network, no credentials) ===\n')

  console.log('model id classification')
  check('"qwen/qwen3.7-flash" is a gateway model', isGatewayModel('qwen/qwen3.7-flash'))
  check('"google/gemini-2.5-flash-lite" is a gateway model', isGatewayModel('google/gemini-2.5-flash-lite'))
  check('"claude-sonnet-4-6" is NOT a gateway model', !isGatewayModel('claude-sonnet-4-6'))
  check('"claude-haiku-4-5-20251001" is NOT a gateway model', !isGatewayModel('claude-haiku-4-5-20251001'))

  console.log('\nmodel resolution from env')
  const saved = { a: process.env.ANALYSIS_MODEL, d: process.env.DETECT_MODEL }
  delete process.env.ANALYSIS_MODEL
  delete process.env.DETECT_MODEL
  check('unset -> analysis falls back to claude-sonnet-4-6', analysisModel() === 'claude-sonnet-4-6', analysisModel())
  check('unset -> detect falls back to claude-sonnet-4-6', detectModel() === 'claude-sonnet-4-6', detectModel())

  process.env.ANALYSIS_MODEL = 'qwen/qwen3.7-flash'
  check('ANALYSIS_MODEL set -> analysis follows it', analysisModel() === 'qwen/qwen3.7-flash', analysisModel())
  check(
    'ANALYSIS_MODEL set -> detect FOLLOWS IT TOO (this is the half-switch bug)',
    detectModel() === 'qwen/qwen3.7-flash',
    detectModel()
  )

  process.env.DETECT_MODEL = 'claude-haiku-4-5-20251001'
  check('DETECT_MODEL overrides detect only', detectModel() === 'claude-haiku-4-5-20251001', detectModel())
  check('DETECT_MODEL does not touch analysis', analysisModel() === 'qwen/qwen3.7-flash', analysisModel())
  delete process.env.DETECT_MODEL

  console.log('\nwhere a call actually goes (fetch intercepted, nothing sent)')
  const realFetch = globalThis.fetch
  let lastUrl = ''
  let lastBody: Record<string, unknown> = {}
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    lastUrl = String(url)
    lastBody = JSON.parse(String(init?.body ?? '{}'))
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"release_frame": 7}' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
        model: lastBody.model,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  }) as typeof fetch

  const savedKey = process.env.OPENROUTER_API_KEY
  process.env.OPENROUTER_API_KEY = 'test-key-not-real'
  const r = await callVisionModel({
    model: 'qwen/qwen3.7-flash',
    framesBase64: [TINY_JPEG, TINY_JPEG],
    frameMimeTypes: ['image/jpeg', 'image/jpeg'],
    userText: 'find the release',
    maxTokens: 300,
  })
  check('gateway model -> openrouter.ai, not api.anthropic.com', lastUrl.includes('openrouter.ai'), lastUrl)
  check('sends the model id it was asked for', lastBody.model === 'qwen/qwen3.7-flash', String(lastBody.model))
  check('temperature pinned to 0 (identical frames must grade identically)', lastBody.temperature === 0)
  check('both frames are attached', JSON.stringify(lastBody).split('data:image/jpeg').length - 1 === 2)
  check('no system message on a single-turn call', !JSON.stringify(lastBody.messages).includes('"system"'))
  check('returns the provider text', r.text.includes('release_frame'), r.text)

  if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY
  else process.env.OPENROUTER_API_KEY = savedKey
  globalThis.fetch = realFetch
  if (saved.a === undefined) delete process.env.ANALYSIS_MODEL
  else process.env.ANALYSIS_MODEL = saved.a

  console.log('\n=== Phase 2: one real gateway call ===\n')
  if (!process.env.OPENROUTER_API_KEY) {
    console.log('  — skipped: OPENROUTER_API_KEY not set in .env.local')
  } else {
    try {
      const live = await callVisionModel({
        model: process.env.TEST_MODEL || 'qwen/qwen3.7-flash',
        framesBase64: [TINY_JPEG],
        frameMimeTypes: ['image/jpeg'],
        userText: 'Reply with exactly this JSON and nothing else: {"ok": true}',
        maxTokens: 50,
      })
      check('a real gateway call returns text', live.text.length > 0, JSON.stringify(live.text).slice(0, 120))
      check('provider reports a model', !!live.model, live.model)
      check('usage is reported', live.usage.input > 0, JSON.stringify(live.usage))
      console.log(`    model: ${live.model}  in:${live.usage.input} out:${live.usage.output}`)
      console.log(`    said: ${JSON.stringify(live.text).slice(0, 160)}`)
    } catch (err) {
      fail++
      console.error(`  ✗ live gateway call threw — ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  console.log(`\n${pass} passed, ${fail} failed\n`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('harness threw:', e)
  process.exit(1)
})
