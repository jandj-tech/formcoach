/**
 * Lets ANALYSIS_MODEL point at something other than Anthropic.
 *
 * Grading is ~6 vision calls over 28 frames (33,488 image tokens), which on
 * claude-sonnet-4-6 costs roughly $0.43 per analysis. The same pipeline on
 * alibaba/qwen3.7-flash prices at about $0.007 — 98% less. Whether it grades
 * as WELL is an empirical question, and the point of this module is to let the
 * eval harness answer it: set ANALYSIS_MODEL and run `npm run eval`, with no
 * other code change.
 *
 * Routing rule: a model id containing "/" (alibaba/qwen3.7-flash,
 * google/gemini-2.5-flash-lite) goes to the Vercel AI Gateway, which speaks
 * OpenAI's wire format and fronts ~176 vision-capable models. Anything else
 * (claude-sonnet-4-6, claude-haiku-4-5) stays on the Anthropic SDK, unchanged.
 *
 * Auth prefers AI_GATEWAY_API_KEY; failing that it uses VERCEL_OIDC_TOKEN,
 * which Vercel injects in its own runtime and `vercel env pull` refreshes
 * locally. The OIDC token is short-lived (~12h), so it is fine for evals and
 * for deployed code, and useless in a stale local .env.
 */

const VERCEL_GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1/chat/completions'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

/**
 * Two OpenAI-compatible fronts, and which one answers.
 *
 * OpenRouter wins when OPENROUTER_API_KEY is set, because Vercel's gateway
 * rate-limits its free tier per-model — during the model bake-off it returned
 * 429 on most candidates, which is indistinguishable from "this model is bad"
 * unless you read the body. A funded OpenRouter key removes that failure mode.
 * Without one, fall back to Vercel's gateway on the OIDC token.
 */
function endpointAndAuth(): { url: string; token: string; headers: Record<string, string> } {
  const or = process.env.OPENROUTER_API_KEY
  if (or) {
    return {
      url: OPENROUTER_URL,
      token: or,
      // OpenRouter attributes traffic with these; harmless and it keeps the
      // request off the anonymous pool.
      headers: {
        'HTTP-Referer': 'https://www.learnhoops.com',
        'X-Title': 'LearnHoops shot grading',
      },
    }
  }
  const vercel = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN
  if (!vercel) {
    throw new Error(
      'ANALYSIS_MODEL is a gateway model but no provider credential is set. ' +
        'Set OPENROUTER_API_KEY, or run `vercel env pull` to refresh VERCEL_OIDC_TOKEN.'
    )
  }
  return { url: VERCEL_GATEWAY_URL, token: vercel, headers: {} }
}

export interface ModelCallResult {
  text: string
  usage: {
    input: number
    output: number
    /** Anthropic-only; gateway providers do not report these separately. */
    cacheWrite?: number
    cacheRead?: number
  }
  /** What the provider says it ran, which is not always what we asked for. */
  model: string
}

/** A "/" in the id means a gateway model. Anthropic ids never contain one. */
export function isGatewayModel(model: string): boolean {
  return model.includes('/')
}


/**
 * One vision call in OpenAI's chat-completions shape.
 *
 * No prompt caching: the gateway's OpenAI surface has no cache_control, so the
 * ~16K rubric is re-billed every pass. That is already priced in — at
 * $0.03/Mtok the whole uncached rubric costs about $0.0005, which is why the
 * caching that matters so much on Sonnet stops mattering at all down here.
 *
 * `response_format: json_object` is deliberately NOT set: support is uneven
 * across 176 models, and the caller already extracts the JSON object with a
 * regex, which works whether or not the model wraps it in prose.
 */
export async function callGatewayModel(params: {
  model: string
  systemPrompt: string
  framesBase64: string[]
  frameMimeTypes: string[]
  userText: string
  maxTokens: number
}): Promise<ModelCallResult> {
  const { model, systemPrompt, framesBase64, frameMimeTypes, userText, maxTokens } = params

  const content: Array<Record<string, unknown>> = framesBase64.map((b64, i) => ({
    type: 'image_url',
    image_url: { url: `data:${frameMimeTypes[i] || 'image/jpeg'};base64,${b64}` },
  }))
  content.push({ type: 'text', text: userText })

  const { url, token, headers } = endpointAndAuth()
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content },
      ],
    }),
    // A grading pass over 28 frames on a small model is slow but not endless;
    // without a ceiling a hung provider would hold the whole ensemble open.
    signal: AbortSignal.timeout(180_000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Gateway ${res.status} for ${model}: ${body.slice(0, 300)}`)
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
    model?: string
  }

  const text = json.choices?.[0]?.message?.content ?? ''
  if (!text) throw new Error(`Gateway returned no content for ${model}`)

  return {
    text,
    usage: {
      input: json.usage?.prompt_tokens ?? 0,
      output: json.usage?.completion_tokens ?? 0,
    },
    model: json.model ?? model,
  }
}
