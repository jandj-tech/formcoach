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
    // Both carry canonical metadata but were never listed. /org/pricing is
    // deliberately absent — it needs a signup cookie and redirects without one.
    { url: `${BASE}/team`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/org/signup`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
  ]
}
