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
  /** Omitted for single-turn calls; an empty system message is rejected by some providers. */
  systemPrompt?: string
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
  const isOpenRouter = url.includes('openrouter.ai')
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
      // Reasoning models put chain-of-thought in `reasoning` and the answer in
      // `content`, and BILL THE THINKING AS OUTPUT. qwen3.7-flash spends it
      // freely — on a trivial one-line prompt it burned 301 output tokens and
      // returned content:null with finish_reason "length", against 6 tokens
      // and a correct answer with reasoning off.
      //
      // That is why the token ceiling has to be generous (16000 below): the
      // budget has to cover the thinking AND the answer, and a reasoning model
      // that runs out mid-thought returns nothing at all. Disabling reasoning
      // "fixes" the truncation and guts the accuracy — see the measurement on
      // the parameter below. The ceiling is the fix; the thinking stays.
      // Reasoning stays ON. Measured on the 28-fixture suite, paired per cell:
      // turning it off cost 36 cells fixed against 10 broken, McNemar exact
      // p = 0.0002 — qwen went from 2.08 expert failures per fixture to 3.08,
      // against Sonnet's 1.73. The thinking is most of this model's accuracy.
      // GATEWAY_REASONING=0 disables it, which is only worth doing to
      // reproduce that measurement.
      ...(isOpenRouter && process.env.GATEWAY_REASONING === '0'
        ? { reasoning: { enabled: false } }
        : {}),
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        { role: 'user', content },
      ],
    }),
    // A grading pass over 28 frames on a small model is slow but not endless;
    // without a ceiling a hung provider would hold the whole ensemble open.
    // 180s was too tight once reasoning is in the budget — one fixture in the
    // sweep aborted here, which reads as DID NOT RUN and silently shrinks the
    // suite. Reasoning over 28 images is simply slow.
    signal: AbortSignal.timeout(300_000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Gateway ${res.status} for ${model}: ${body.slice(0, 300)}`)
  }

  const json = (await res.json()) as {
    choices?: Array<{
      message?: { content?: string | null; reasoning?: string | null }
      finish_reason?: string
    }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
    model?: string
  }

  const choice = json.choices?.[0]
  const text = choice?.message?.content ?? ''
  if (!text) {
    // Distinguish the three ways this happens, because "no content" sent us
    // looking at the wrong thing once already.
    const reasoned = !!choice?.message?.reasoning
    const truncated = choice?.finish_reason === 'length'
    const why = reasoned
      ? `it spent the whole ${maxTokens}-token budget on hidden reasoning (finish_reason=${choice?.finish_reason}). ` +
        'Reasoning is disabled by default for OpenRouter; GATEWAY_REASONING=1 turns it back on and this is what that costs.'
      : truncated
        ? `output hit the ${maxTokens}-token ceiling before the answer closed`
        : 'the provider returned an empty message'
    throw new Error(`Gateway returned no content for ${model}: ${why}`)
  }

  return {
    text,
    usage: {
      input: json.usage?.prompt_tokens ?? 0,
      output: json.usage?.completion_tokens ?? 0,
    },
    model: json.model ?? model,
  }
}


/**
 * Which model each stage runs on.
 *
 * Grading and the two localisation calls are separated because they are not the
 * same job: localisation only has to point at the right frame, while grading has
 * to produce ~18 defensible scores. If a cheap model turns out to localise well
 * but grade badly, DETECT_MODEL lets the cheap one keep the cheap job.
 * Unset, detection follows ANALYSIS_MODEL, which is what you want during a
 * model switch — otherwise half the pipeline silently stays on the old provider.
 */
export function analysisModel(): string {
  return process.env.ANALYSIS_MODEL || 'claude-sonnet-4-6'
}
export function detectModel(): string {
  return process.env.DETECT_MODEL || process.env.ANALYSIS_MODEL || 'claude-sonnet-4-6'
}

/**
 * One single-turn vision call — frames plus a prompt, JSON back — routed to
 * whichever provider owns `model`.
 *
 * THE BUG THIS EXISTS TO PREVENT: setting ANALYSIS_MODEL used to switch only
 * the grading call. The release gate and both /api/detect-shot-* routes went on
 * calling Anthropic — the gate passing the gateway model id straight to
 * Anthropic, which rejects it, and the detect routes with claude-sonnet-4-6
 * hardcoded. So "switching models" left three of the four vision calls on the
 * old provider, and on an Anthropic account with no credits that is not a
 * degraded pipeline, it is a broken one.
 *
 * No prompt caching here on purpose: these calls are small, single-shot, and
 * never repeated within an analysis, so there is no prefix worth caching.
 */
export async function callVisionModel(params: {
  model: string
  framesBase64: string[]
  frameMimeTypes: string[]
  userText: string
  maxTokens: number
}): Promise<ModelCallResult> {
  const { model, framesBase64, frameMimeTypes, userText, maxTokens } = params

  if (isGatewayModel(model)) {
    return callGatewayModel({ model, framesBase64, frameMimeTypes, userText, maxTokens })
  }

  // Imported lazily so a gateway-only deployment never has to load the
  // Anthropic SDK, and so this module stays importable without ANTHROPIC_API_KEY.
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const response = await client.messages.create({
    temperature: 0,
    model,
    max_tokens: maxTokens,
    messages: [{
      role: 'user',
      content: [
        ...framesBase64.map((data, i) => ({
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: (frameMimeTypes[i] || 'image/jpeg') as 'image/jpeg',
            data,
          },
        })),
        { type: 'text' as const, text: userText },
      ],
    }],
  })
  const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
  return {
    text,
    usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
    model: response.model,
  }
}
