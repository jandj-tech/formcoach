import type { MetadataRoute } from 'next'

const BASE = 'https://www.learnhoops.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    { url: `${BASE}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/analyze`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE}/shop`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/cart`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/partners`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
  ]
}
