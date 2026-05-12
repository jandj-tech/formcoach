// Strip internal AI flag identifiers and meta-language out of reasoning text
// before showing it to users. The model is told to use natural language, but
// historical rows may still contain snake_case flag names like
// `elbow_severely_out` or phrases like "critical_flag triggered".

const INTERNAL_TERMS: Array<[RegExp, string]> = [
  // Specific flag identifiers
  [/\belbow_severely_out\b/gi, 'elbow being out'],
  [/\bfollowthrough_flick_to_side\b/gi, 'follow-through flick'],
  [/\barc_too_flat\b/gi, 'flat arc'],
  // Meta references that leak internal mechanics
  [/\bcritical[_ ]?flags?\b/gi, ''],
  [/\bflag(?:ged|s)?\s+(?:as\s+)?(?:true|false)\b/gi, ''],
  [/\b(?:score\s+)?capped?\s+at\s+\d+(?:\.\d+)?\b/gi, ''],
  [/\bcap(?:ped)?\s+applied\b/gi, ''],
  [/\bper\s+the\s+rules?\b/gi, ''],
]

export function humanizeReasoning(text: string | null | undefined): string {
  if (!text) return ''
  let out = text
  for (const [pat, replacement] of INTERNAL_TERMS) {
    out = out.replace(pat, replacement)
  }
  // Collapse whitespace and stray punctuation left behind by removals
  return out
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+\./g, '.')
    .trim()
}
