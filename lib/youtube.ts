import 'server-only'

type ChannelVideo = { id: string; title: string }

type PlaylistItem = {
  snippet?: {
    title?: string
    resourceId?: { videoId?: string }
  }
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'in', 'on', 'to', 'for', 'with',
  'from', 'your', 'my', 'at', 'by', 'as', 'is', 'are', 'be', 'this', 'that',
])

// Manual mappings — criterion name → YouTube video ID. These win over the
// auto-matcher and "claim" the video so it can't be assigned elsewhere.
// Keys must match the criterion `name` column in the database exactly.
const MANUAL_OVERRIDES: Record<string, string> = {
  'Elbow L-Shape — Under the Ball': 'ckqfMb40jwY',
  'Palm Non-Contact with Ball': 'xktQZ3HydPk',
  'Square to the Basket': 'jTT0D6ZQXIc',
  'Knees Bent': 'R_XPqeo-wks',
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t))
}

async function fetchChannelUploads(
  channelId: string,
  apiKey: string,
  max = 50,
): Promise<ChannelVideo[]> {
  // YouTube convention: a channel's "uploads" playlist ID is the channel ID
  // with the second character flipped from C to U (UCxxx -> UUxxx).
  const playlistId = 'UU' + channelId.slice(2)
  const url =
    `https://www.googleapis.com/youtube/v3/playlistItems` +
    `?part=snippet&maxResults=${max}` +
    `&playlistId=${encodeURIComponent(playlistId)}` +
    `&key=${encodeURIComponent(apiKey)}`

  try {
    const res = await fetch(url, {
      next: { revalidate: 3600, tags: ['youtube-videos'] },
    })
    if (!res.ok) return []
    const data = (await res.json()) as { items?: PlaylistItem[] }
    return (data.items ?? [])
      .map((it): ChannelVideo | null => {
        const id = it.snippet?.resourceId?.videoId
        const title = it.snippet?.title
        if (!id || !title) return null
        return { id, title }
      })
      .filter((v): v is ChannelVideo => v !== null)
  } catch {
    return []
  }
}

/**
 * Resolve each criterion name to the best-matching video on the channel.
 * Returns a map keyed by criterion name. Names without a confident match
 * are omitted; the caller falls back to a channel-search link in that case.
 *
 * Matching: token overlap between criterion name and video title, ignoring
 * stop words and short tokens. Requires at least 2 overlapping tokens to
 * avoid spurious matches on common words like "shot" or "ball".
 */
export async function getCriteriaVideoMap(
  criteriaNames: string[],
): Promise<Record<string, string>> {
  if (criteriaNames.length === 0) return {}

  const map: Record<string, string> = {}

  // 1) Manual overrides win and claim the video so it can't be reused by auto-match.
  for (const name of criteriaNames) {
    const override = MANUAL_OVERRIDES[name]
    if (override) map[name] = override
  }
  const claimedVideoIds = new Set(Object.values(map))

  // 2) Auto-match the rest from the channel's recent uploads (if API is configured).
  const channelId = process.env.YOUTUBE_CHANNEL_ID
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!channelId || !apiKey) return map

  const videos = await fetchChannelUploads(channelId, apiKey, 50)
  if (videos.length === 0) return map

  for (const name of criteriaNames) {
    if (map[name]) continue

    const cTokens = tokenize(name)
    if (cTokens.length === 0) continue

    let bestId: string | null = null
    let bestScore = 0

    for (const video of videos) {
      if (claimedVideoIds.has(video.id)) continue
      const vTokens = new Set(tokenize(video.title))
      const overlap = cTokens.filter((t) => vTokens.has(t)).length
      if (overlap >= 2 && overlap > bestScore) {
        bestScore = overlap
        bestId = video.id
      }
    }

    if (bestId) map[name] = bestId
  }

  return map
}
