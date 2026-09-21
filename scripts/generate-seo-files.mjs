import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SHEET_ID = '1PIcdiUt1_Yj9Mf1zErlEPObBl5Kg6W5Z3Qd5p54-WRE'
const CONTACT_CSV = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Contact`

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(root, 'public')

const parseCsv = (text) => {
  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"'
        i += 1
      } else if (char === '"') {
        inQuotes = false
      } else {
        cell += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (char !== '\r') {
      cell += char
    }
  }

  if (cell.length || row.length) {
    row.push(cell)
    rows.push(row)
  }

  return rows.filter((r) => r.some((value) => value.trim() !== ''))
}

const normalizeKey = (value) => value.trim().toLowerCase()

const isUsableSiteUrl = (value) => {
  const v = (value || '').trim()
  if (!v) return false
  if (/^n\/?a\b/i.test(v)) return false
  if (/for now/i.test(v)) return false
  try {
    const url = new URL(v)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

const fetchContactUrl = async () => {
  const response = await fetch(CONTACT_CSV)
  if (!response.ok) throw new Error(`Failed to load Contact sheet (${response.status})`)
  const rows = parseCsv(await response.text())
  if (rows.length < 2) return ''

  const headers = rows[0].map(normalizeKey)
  const textIdx = headers.indexOf('text')
  const contentIdx = headers.indexOf('content')
  if (textIdx === -1 || contentIdx === -1) return ''

  for (const cols of rows.slice(1)) {
    if (normalizeKey(cols[textIdx] || '') === 'url') {
      return (cols[contentIdx] || '').trim()
    }
  }
  return ''
}

mkdirSync(publicDir, { recursive: true })

const siteUrl = await fetchContactUrl()
const hasSiteUrl = isUsableSiteUrl(siteUrl)
const canonical = hasSiteUrl ? siteUrl.replace(/\/?$/, '/') : ''

const robots = hasSiteUrl
  ? `User-agent: *\nAllow: /\n\nSitemap: ${canonical}sitemap.xml\n`
  : `User-agent: *\nAllow: /\n\n# Sitemap omitted until Contact sheet URL is set.\n`

writeFileSync(join(publicDir, 'robots.txt'), robots)

if (hasSiteUrl) {
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${canonical}</loc>
  </url>
</urlset>
`
  writeFileSync(join(publicDir, 'sitemap.xml'), sitemap)
  console.log(`SEO files written with site URL: ${canonical}`)
} else {
  // Keep a stub so old deploys don't 404 if linked; empty urlset until URL exists.
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- No <url> entries until Contact sheet URL is set. -->
</urlset>
`
  writeFileSync(join(publicDir, 'sitemap.xml'), sitemap)
  console.log('SEO files written without site URL (Contact sheet URL is N/A).')
}
