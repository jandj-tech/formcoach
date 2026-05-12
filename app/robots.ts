import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin/', '/gate/', '/api/', '/results/', '/unsubscribed/'],
    },
    sitemap: 'https://www.learnhoops.com/sitemap.xml',
    host: 'https://www.learnhoops.com',
  }
}
