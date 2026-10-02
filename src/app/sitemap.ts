import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const rawUrl = process.env.NEXT_PUBLIC_SITE_URL || (process.env.PUBLIC_APP_URL && !process.env.PUBLIC_APP_URL.includes('ngrok') ? process.env.PUBLIC_APP_URL : 'https://vidhyalayam.com')
  const baseUrl = rawUrl.replace(/\/$/, '')

  return [
    {
      url: `${baseUrl}`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/login`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ]
}
