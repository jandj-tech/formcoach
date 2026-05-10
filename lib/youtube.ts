import 'server-only'

export type YouTubeVideo = {
  id: string
  title: string
  thumbnail: string
  publishedAt: string
}

type PlaylistItem = {
  snippet?: {
    title?: string
    publishedAt?: string
    resourceId?: { videoId?: string }
    thumbnails?: Record<string, { url?: string } | undefined>
  }
}

export async function getLatestVideos(max = 12): Promise<YouTubeVideo[]> {
  const channelId = process.env.YOUTUBE_CHANNEL_ID
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!channelId || !apiKey) return []

  // YouTube convention: a channel's "uploads" playlist ID is the channel ID
  // with the second character flipped from C to U (UCxxx -> UUxxx).
  const playlistId = 'UU' + channelId.slice(2)
  const url =
    `https://www.googleapis.com/youtube/v3/playlistItems` +
    `?part=snippet&maxResults=${max}&playlistId=${encodeURIComponent(playlistId)}&key=${encodeURIComponent(apiKey)}`

  let data: { items?: PlaylistItem[] }
  try {
    const res = await fetch(url, {
      next: { revalidate: 3600, tags: ['youtube-videos'] },
    })
    if (!res.ok) return []
    data = (await res.json()) as { items?: PlaylistItem[] }
  } catch {
    return []
  }

  return (data.items ?? [])
    .map((item): YouTubeVideo | null => {
      const s = item.snippet
      const id = s?.resourceId?.videoId
      if (!id || !s) return null
      const t = s.thumbnails ?? {}
      const thumb =
        t.maxres?.url ??
        t.high?.url ??
        t.medium?.url ??
        t.default?.url ??
        ''
      return {
        id,
        title: s.title ?? '',
        thumbnail: thumb,
        publishedAt: s.publishedAt ?? '',
      }
    })
    .filter((v): v is YouTubeVideo => v !== null)
}
