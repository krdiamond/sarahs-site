import './style.css'
import JSZip from 'jszip'

const SHEET_ID = '1PIcdiUt1_Yj9Mf1zErlEPObBl5Kg6W5Z3Qd5p54-WRE'
const DEFAULT_ICON_WIDTH = 160
/** Cap decoded source pixels (covers 160css @2x); shrinks huge sheet media for faster decode. */
const MAX_ICON_SOURCE_PX = 320
const MARQUEE_ICON_HEIGHT = 80
const MOBILE_MQ = '(max-width: 767px)'
const NARROW_MQ = '(max-width: 450px)'
const SITE_TITLE = 'Sarah Fensom'
/** Baseline CSS animation duration at Marquee Speed = 1. */
const MARQUEE_BASE_SECONDS = 28
const EVENTS_ERROR_MSG = 'Couldn’t load events — try refreshing'
const WORK_ERROR_MSG = 'Couldn’t load works — try refreshing'
const CONTACT_ERROR_MSG = 'Couldn’t load contact — try refreshing'

const perfMark = (label, t0) => {
  const ms = performance.now() - t0
  console.info(`[perf] ${label}: ${ms.toFixed(0)}ms`)
  return ms
}

const INSTAGRAM_PATH =
  'M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7zm5 3.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 0 1 12 7.5zm0 2A2.5 2.5 0 1 0 14.5 12 2.5 2.5 0 0 0 12 9.5zM17.75 6a1.25 1.25 0 1 1-1.25 1.25A1.25 1.25 0 0 1 17.75 6z'

const emptyContact = () => ({
  name: '',
  jobTitle: '',
  url: '',
  about: '',
  email: '',
  instagram: '',
  addressLocality: '',
  addressRegion: '',
  addressCountry: '',
  marqueeSpeed: 1,
})

const sheetCsvUrl = (sheetName, { headers, tq } = {}) => {
  const params = new URLSearchParams({
    tqx: 'out:csv',
    sheet: sheetName,
  })
  if (headers === 0) params.set('headers', '0')
  if (tq) params.set('tq', tq)
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?${params}`
}
const sheetXlsxUrl = () =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`

/** Session-cached workbook: one network fetch shared by Icons + Favicon. */
let workbookPromise = null
/** @type {import('jszip') | null} */
let workbookZip = null
/** @type {ArrayBuffer | null} */
let workbookBuffer = null

const getWorkbookZip = () => {
  if (!workbookPromise) {
    workbookPromise = (async () => {
      const t0 = performance.now()
      const response = await fetch(sheetXlsxUrl())
      if (!response.ok) throw new Error('Failed to load workbook')
      const buffer = await response.arrayBuffer()
      workbookBuffer = buffer
      const zip = await JSZip.loadAsync(buffer)
      workbookZip = zip
      console.info(
        `[perf] xlsx fetch+parse: ${(performance.now() - t0).toFixed(0)}ms, ${buffer.byteLength} bytes (single shared fetch)`,
      )
      return zip
    })()
  }
  return workbookPromise
}

/** @type {Array<{date: string, title: string, credit: string, url: string}>} */
let events = []
/** @type {Array<{date: string, title: string, credit: string, url: string}>} */
let work = []
let contact = emptyContact()
let eventsError = ''
let workError = ''
let contactError = ''
/** @type {Array<Record<string, any>>} */
let helpers = []
const objectUrls = []
let isMobile = false
let isNarrow = false
/**
 * ≤450px marquee is a pure HTML/CSS island: createElement once into a stable
 * host, then never touch that DOM again.
 */
let marqueeIslandBuilt = false
let mobileMq = null
let narrowMq = null
/** @type {HTMLElement | null} */
let stageEl = null
/** @type {HTMLElement | null} */
let marqueeHostEl = null
/** @type {HTMLElement | null} */
let stageLoadingEl = null
/** @type {HTMLElement | null} */
let marqueeLoadingEl = null
/** @type {{ id: string, offsetX: number, offsetY: number } | null} */
let drag = null
let zCounter = 1
const initStartedAt = performance.now()

const setDesktopLoading = (visible) => {
  stageLoadingEl?.classList.toggle('hidden', !visible)
}
const setMarqueeLoading = (visible) => {
  marqueeLoadingEl?.classList.toggle('hidden', !visible)
}

const contactEmailDisplay = () =>
  (contact.email || '').replace(/^mailto:/i, '').trim()

const iconScale = () => (isMobile ? 0.5 : 1)

const displayWidth = (helper) => Math.round(helper.baseWidth * iconScale())
const displayHeight = (helper) => Math.round(helper.baseHeight * iconScale())

const loadDecodedImage = async (src) => {
  const img = new Image()
  img.src = src
  try {
    await Promise.race([
      typeof img.decode === 'function'
        ? img.decode()
        : new Promise((resolve, reject) => {
            img.onload = resolve
            img.onerror = reject
          }),
      new Promise((resolve) => {
        window.setTimeout(resolve, 2500)
      }),
    ])
  } catch {
    // non-fatal
  }
  if (!img.complete) {
    await new Promise((resolve) => {
      img.onload = resolve
      img.onerror = resolve
      window.setTimeout(resolve, 2500)
    })
  }
  return img
}

const appendMarqueeItem = (group, item) => {
  if (item.type === 'h1') {
    const span = document.createElement('span')
    span.className = 'marquee-item'
    span.textContent = SITE_TITLE
    group.appendChild(span)
    return
  }
  const img = document.createElement('img')
  img.className = 'marquee-item'
  img.src = item.src
  img.alt = ''
  img.width = item.width
  img.height = item.height
  img.draggable = false
  img.style.width = `${item.width}px`
  img.style.height = `${item.height}px`
  group.appendChild(img)
}

const buildMarqueeGroup = (items) => {
  const group = document.createElement('div')
  group.className = 'marquee-group'
  for (const item of items) appendMarqueeItem(group, item)
  return group
}

/**
 * One-shot imperative mount. Sets --marquee-duration once; CSS owns motion.
 * Uses pre-decoded helper sizes — never remounts / never updates mid-loop.
 */
const prepareMarqueeOnce = async () => {
  if (marqueeIslandBuilt) return
  const host = marqueeHostEl
  if (!host) return
  marqueeIslandBuilt = true
  const t0 = performance.now()

  try {
    const icons = helpers
    const decoded = icons.map((helper) => ({
      type: 'icon',
      src: helper.src,
      width:
        helper.marqueeWidth ||
        Math.max(
          1,
          Math.round(
            (MARQUEE_ICON_HEIGHT * (helper.naturalWidth || helper.baseWidth)) /
              Math.max(1, helper.naturalHeight || helper.baseHeight || 1),
          ),
        ),
      height: helper.marqueeHeight || MARQUEE_ICON_HEIGHT,
    }))

    // Ensure bitmaps are in the decoder cache before CSS animation starts.
    await Promise.all(decoded.map((item) => loadDecodedImage(item.src)))

    const items = []
    if (!decoded.length) {
      items.push({ type: 'h1' })
    } else {
      for (const icon of decoded) {
        items.push({ type: 'h1' })
        items.push(icon)
      }
    }

    const speed = contact.marqueeSpeed
    const safe = Number.isFinite(speed) && speed > 0 ? speed : 1
    const duration = MARQUEE_BASE_SECONDS / safe

    const track = document.createElement('div')
    track.className = 'marquee-track'
    track.style.setProperty('--marquee-duration', `${duration}s`)
    track.appendChild(buildMarqueeGroup(items))
    track.appendChild(buildMarqueeGroup(items))

    host.replaceChildren(track)
    setMarqueeLoading(false)
    setDesktopLoading(false)
    perfMark('marquee mount (from prepareMarqueeOnce start)', t0)
    console.info(
      `[perf] time-to-marquee-start (from page init): ${(performance.now() - initStartedAt).toFixed(0)}ms`,
    )
  } catch (error) {
    console.error(error)
    const track = document.createElement('div')
    track.className = 'marquee-track'
    track.style.setProperty('--marquee-duration', `${MARQUEE_BASE_SECONDS}s`)
    track.appendChild(buildMarqueeGroup([{ type: 'h1' }]))
    track.appendChild(buildMarqueeGroup([{ type: 'h1' }]))
    host.replaceChildren(track)
    setMarqueeLoading(false)
    setDesktopLoading(false)
  }
}

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

const rowsToEntries = (rows, creditKeys) => {
  if (rows.length < 2) return []
  const headers = rows[0].map(normalizeKey)
  const dateIdx = headers.indexOf('date')
  const titleIdx = headers.indexOf('title')
  const linkIdx = headers.indexOf('link')
  const creditIdx = creditKeys
    .map((key) => headers.indexOf(key))
    .find((idx) => idx !== -1)

  if (dateIdx === -1 || titleIdx === -1 || creditIdx === undefined) return []

  return rows
    .slice(1)
    .map((cols) => ({
      date: (cols[dateIdx] || '').trim(),
      title: (cols[titleIdx] || '').trim(),
      credit: (cols[creditIdx] || '').trim(),
      url: (linkIdx === -1 ? '' : cols[linkIdx] || '').trim() || '#',
    }))
    .filter((item) => item.date && item.title)
}

const fetchSheet = async (sheetName, creditKeys) => {
  const response = await fetch(sheetCsvUrl(sheetName))
  if (!response.ok) throw new Error(`Failed to load ${sheetName}`)
  const text = await response.text()
  return rowsToEntries(parseCsv(text), creditKeys)
}

/** Positive finite multiplier; invalid/missing/≤0 → 1. */
const parseMarqueeSpeed = (value) => {
  const n = Number.parseFloat(String(value ?? '').trim())
  if (!Number.isFinite(n) || n <= 0) return 1
  return n
}

const fetchContactSheet = async () => {
  // headers=0 keeps Text/Content as data rows (gviz default header mode
  // can collapse this sheet into unusable column labels).
  const response = await fetch(
    sheetCsvUrl('Contact', { headers: 0, tq: 'select A, B' }),
  )
  if (!response.ok) throw new Error('Failed to load Contact')
  const rows = parseCsv(await response.text())
  if (!rows.length) throw new Error('Contact sheet is empty')

  const headers = rows[0].map(normalizeKey)
  let textIdx = headers.indexOf('text')
  let contentIdx = headers.indexOf('content')
  let dataRows = rows.slice(1)

  // Resilient fallback: first two columns as Text/Content pairs.
  if (textIdx === -1 || contentIdx === -1) {
    textIdx = 0
    contentIdx = Math.min(1, (rows[0]?.length || 1) - 1)
    const firstKey = normalizeKey(rows[0]?.[textIdx] || '')
    dataRows = firstKey === 'text' ? rows.slice(1) : rows
  }

  const fields = {}
  for (const cols of dataRows) {
    const key = normalizeKey(cols[textIdx] || '')
    if (!key || key === 'text') continue
    fields[key] = (cols[contentIdx] || '').trim()
  }

  return {
    name: fields.name || '',
    jobTitle: fields['job title'] || '',
    url: fields.url || '',
    about: fields.about || '',
    email: fields.email || '',
    instagram: fields.instagram || '',
    // Sheet currently uses typo "Adress Locality"; accept both.
    addressLocality:
      fields['address locality'] || fields['adress locality'] || '',
    addressRegion: fields['address region'] || '',
    addressCountry: fields['address country'] || '',
    // Extra Contact rows (e.g. Marquee Speed) must not break the load.
    marqueeSpeed: parseMarqueeSpeed(fields['marquee speed']),
  }
}

const setMetaContent = (selector, content, attr = 'content') => {
  const el = document.querySelector(selector)
  if (el && content) el.setAttribute(attr, content)
}

const syncPersonJsonLd = () => {
  const c = contact
  const person = {
    '@context': 'https://schema.org',
    '@type': 'Person',
  }

  if (c.name) person.name = c.name
  if (c.jobTitle) person.jobTitle = c.jobTitle
  if (c.about) person.description = c.about
  if (isUsableSiteUrl(c.url)) person.url = c.url.replace(/\/?$/, '/')

  const email = (c.email || '').trim()
  if (email) {
    person.email = /^mailto:/i.test(email) ? email : `mailto:${email}`
  }

  if (c.instagram) person.sameAs = [c.instagram]

  if (c.addressLocality || c.addressRegion || c.addressCountry) {
    person.address = { '@type': 'PostalAddress' }
    if (c.addressLocality) person.address.addressLocality = c.addressLocality
    if (c.addressRegion) person.address.addressRegion = c.addressRegion
    if (c.addressCountry) person.address.addressCountry = c.addressCountry
  }

  let script = document.getElementById('person-jsonld')
  if (!script) {
    script = document.createElement('script')
    script.type = 'application/ld+json'
    script.id = 'person-jsonld'
    document.head.appendChild(script)
  }
  script.textContent = JSON.stringify(person)
}

/** Keep description meta / JSON-LD in sync with Contact sheet. */
const syncSeoFromContact = () => {
  const about = (contact.about || '').trim()
  if (about) {
    setMetaContent('meta[name="description"]', about)
    setMetaContent('meta[property="og:description"]', about)
    setMetaContent('meta[name="twitter:description"]', about)
  }

  if (contact.name && contact.jobTitle) {
    const title = `${contact.name} — ${contact.jobTitle}`
    document.title = title
    setMetaContent('meta[property="og:title"]', title)
    setMetaContent('meta[name="twitter:title"]', title)
  }

  if (isUsableSiteUrl(contact.url)) {
    const url = contact.url.replace(/\/?$/, '/')
    setMetaContent('meta[property="og:url"]', url)
  }

  syncPersonJsonLd()
}

const listLinkLabel = (item) => {
  const credit = (item.credit || '').trim()
  const creditPart = credit ? ` for ${credit}` : ''
  return `${item.date}: ${item.title}${creditPart} (opens in a new tab)`
}

const renderContact = () => {
  const body = document.getElementById('contact-body')
  if (!body) return

  if (contactError) {
    const p = document.createElement('p')
    p.className = 'm-0 min-h-0 flex-1 overflow-y-auto overscroll-contain'
    p.setAttribute('role', 'status')
    p.setAttribute('aria-live', 'polite')
    p.textContent = contactError
    body.replaceChildren(p)
    body.className = 'min-h-0 flex-1 overflow-hidden'
    return
  }

  body.className = 'min-h-0 flex-1 overflow-y-auto overscroll-contain'
  const ul = document.createElement('ul')
  ul.className = 'space-y-1'

  const email = contactEmailDisplay()
  if (contact.instagram || email) {
    const li = document.createElement('li')
    li.className =
      'flex flex-col gap-1 max-md:mb-2 max-[450px]:mb-[3px] max-[450px]:flex-row max-[450px]:items-center max-[450px]:justify-between max-[450px]:gap-0'

    if (contact.instagram) {
      const a = document.createElement('a')
      a.href = contact.instagram
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.className =
        'inline-flex min-h-6 min-w-6 items-center text-[#0000EE] max-[450px]:order-2'
      a.setAttribute('aria-label', 'Instagram (opens in a new tab)')

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      svg.setAttribute('viewBox', '0 0 24 24')
      svg.setAttribute('width', '16')
      svg.setAttribute('height', '16')
      svg.setAttribute('fill', 'currentColor')
      svg.setAttribute('aria-hidden', 'true')
      svg.classList.add('shrink-0')
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('d', INSTAGRAM_PATH)
      svg.appendChild(path)
      a.appendChild(svg)
      li.appendChild(a)
    }

    if (email) {
      const span = document.createElement('span')
      span.className = 'max-[450px]:order-1'
      span.textContent = email
      li.appendChild(span)
    }

    ul.appendChild(li)
  }

  if (contact.about) {
    const li = document.createElement('li')
    li.className = 'max-md:mb-2 max-[450px]:mb-[3px]'
    const p = document.createElement('p')
    p.className = 'm-0'
    p.textContent = contact.about
    li.appendChild(p)
    ul.appendChild(li)
  }

  body.replaceChildren(ul)
}

const renderListSection = (bodyId, items, errorMsg) => {
  const body = document.getElementById(bodyId)
  if (!body) return

  if (errorMsg) {
    const p = document.createElement('p')
    p.className = 'm-0 min-h-0 flex-1 overflow-y-auto'
    p.setAttribute('role', 'status')
    p.setAttribute('aria-live', 'polite')
    p.textContent = errorMsg
    body.replaceChildren(p)
    return
  }

  const ul = document.createElement('ul')
  ul.className = 'min-h-0 flex-1 space-y-0 overflow-y-auto overscroll-contain'

  for (const item of items) {
    const li = document.createElement('li')
    li.className = 'max-md:mb-2 max-[450px]:mb-[3px]'

    const a = document.createElement('a')
    a.href = item.url
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.className = 'block min-h-6 leading-6 text-[#0000EE] underline'
    a.setAttribute('aria-label', listLinkLabel(item))
    a.append(`${item.date}: ${item.title}`)

    const credit = (item.credit || '').trim()
    if (credit) {
      const span = document.createElement('span')
      span.className = 'italic'
      span.textContent = ` for ${credit}`
      a.appendChild(span)
    }

    li.appendChild(a)
    ul.appendChild(li)
  }

  body.replaceChildren(ul)
}

const loadLists = async () => {
  const [eventsResult, workResult, contactResult] = await Promise.allSettled([
    fetchSheet('Events', ['location', 'publication']),
    fetchSheet('Work', ['publication', 'location']),
    fetchContactSheet(),
  ])

  if (eventsResult.status === 'fulfilled') {
    events = eventsResult.value
    eventsError = ''
  } else {
    events = []
    eventsError = EVENTS_ERROR_MSG
    console.error(eventsResult.reason)
  }

  if (workResult.status === 'fulfilled') {
    work = workResult.value
    workError = ''
  } else {
    work = []
    workError = WORK_ERROR_MSG
    console.error(workResult.reason)
  }

  if (contactResult.status === 'fulfilled') {
    contact = contactResult.value
    contactError = ''
    syncSeoFromContact()
  } else {
    contact = emptyContact()
    contactError = CONTACT_ERROR_MSG
    console.error(contactResult.reason)
  }

  renderContact()
  renderListSection('events-body', events, eventsError)
  renderListSection('work-body', work, workError)
}

const attr = (xml, name) => {
  const match = xml.match(new RegExp(`${name}="([^"]+)"`))
  return match ? match[1] : null
}

const parseRelationships = (xml) => {
  const map = {}
  const matches = xml.matchAll(/<Relationship\b[^>]*>/g)
  for (const match of matches) {
    const tag = match[0]
    const id = attr(tag, 'Id')
    const target = attr(tag, 'Target')
    if (id && target) map[id] = target
  }
  return map
}

const resolveZipPath = (fromPath, target) => {
  if (target.startsWith('/')) return target.slice(1)
  const parts = fromPath.split('/').slice(0, -1)
  for (const part of target.split('/')) {
    if (part === '..') parts.pop()
    else if (part !== '.') parts.push(part)
  }
  return parts.join('/')
}

const readZipText = async (zip, path) => {
  const file = zip.file(path)
  if (!file) throw new Error(`Missing ${path}`)
  return file.async('string')
}

const loadImageNaturalSize = (src) =>
  new Promise((resolve) => {
    const img = new Image()
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () =>
      resolve({ width: DEFAULT_ICON_WIDTH, height: DEFAULT_ICON_WIDTH })
    img.src = src
  })

const findSheetPath = async (zip, sheetName) => {
  const workbook = await readZipText(zip, 'xl/workbook.xml')
  const rels = parseRelationships(
    await readZipText(zip, 'xl/_rels/workbook.xml.rels'),
  )
  const sheetMatch = workbook.match(
    new RegExp(`<sheet\\b[^>]*name="${sheetName}"[^>]*\\/?>`),
  )
  if (!sheetMatch) throw new Error(`${sheetName} sheet not found`)
  const rid = attr(sheetMatch[0], 'r:id')
  const target = rid && rels[rid]
  if (!target) throw new Error(`${sheetName} worksheet relationship missing`)
  return resolveZipPath('xl/workbook.xml', target)
}

const findIconsSheetPath = async (zip) => findSheetPath(zip, 'Icons')

const findDrawingPath = async (zip, sheetPath) => {
  const relsPath = sheetPath.replace(
    /worksheets\/([^/]+)$/,
    'worksheets/_rels/$1.rels',
  )
  const relsXml = await readZipText(zip, relsPath)
  const rels = parseRelationships(relsXml)
  const drawingId = Object.keys(rels).find((id) =>
    rels[id].includes('drawings/'),
  )
  if (!drawingId) return null
  return resolveZipPath(sheetPath, rels[drawingId])
}

const findIconImagePaths = async (zip, drawingPath) => {
  const drawingRelsPath = drawingPath.replace(
    /drawings\/([^/]+)$/,
    'drawings/_rels/$1.rels',
  )
  const relsFile = zip.file(drawingRelsPath)
  if (!relsFile) return []
  const drawingXml = await readZipText(zip, drawingPath)
  const drawingRels = parseRelationships(await relsFile.async('string'))

  const embeds = [...drawingXml.matchAll(/r:embed="([^"]+)"/g)].map(
    (match) => match[1],
  )
  const ordered = embeds.length
    ? embeds
    : Object.keys(drawingRels).sort()

  return ordered
    .map((id) => drawingRels[id])
    .filter(Boolean)
    .map((target) => resolveZipPath(drawingPath, target))
}

const setFaviconFromSrc = (src, type = 'image/png') => {
  let link = document.querySelector("link[rel='icon']")
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.type = type
  link.sizes = type === 'image/png' ? '32x32' : 'any'
  link.href = src
}

const loadImageElement = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })

/** Fit sheet artwork into a sharp square PNG data URL for favicon use. */
const prepareFaviconFromImageSrc = async (src, size = 128) => {
  const img = await loadImageElement(src)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const sw = img.naturalWidth || img.width
  const sh = img.naturalHeight || img.height

  // Sample alpha to trim empty edges when possible
  const probe = document.createElement('canvas')
  probe.width = sw
  probe.height = sh
  const pctx = probe.getContext('2d')
  pctx.drawImage(img, 0, 0)
  const { data } = pctx.getImageData(0, 0, sw, sh)
  let minX = sw
  let minY = sh
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < sh; y += 1) {
    for (let x = 0; x < sw; x += 1) {
      if (data[(y * sw + x) * 4 + 3] > 8) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  const hasContent = maxX >= minX && maxY >= minY
  const cropW = hasContent ? maxX - minX + 1 : sw
  const cropH = hasContent ? maxY - minY + 1 : sh
  const cropX = hasContent ? minX : 0
  const cropY = hasContent ? minY : 0
  const side = Math.max(cropW, cropH)
  const pad = Math.round(side * 0.08)
  const box = side + pad * 2

  canvas.width = size
  canvas.height = size
  ctx.clearRect(0, 0, size, size)
  const scale = size / box
  const dx = (box - cropW) / 2
  const dy = (box - cropH) / 2
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(
    img,
    cropX,
    cropY,
    cropW,
    cropH,
    dx * scale,
    dy * scale,
    cropW * scale,
    cropH * scale,
  )
  return canvas.toDataURL('image/png')
}

const prepareFaviconSvgDataUrl = (emoji) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50" y="54" text-anchor="middle" dominant-baseline="middle" font-size="78">${emoji}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const fetchFaviconSheetGlyph = async () => {
  const response = await fetch(sheetCsvUrl('Favicon'))
  if (!response.ok) throw new Error('Failed to load Favicon sheet')
  const rows = parseCsv(await response.text())
  if (rows.length < 2) return ''
  // Prefer first non-header cell in column A (under "Favicon Icon")
  for (const row of rows.slice(1)) {
    const value = (row[0] || '').trim()
    if (value) return value
  }
  return ''
}

const mimeFromPath = (path, fallback = 'image/png') => {
  if (path.endsWith('.png')) return 'image/png'
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg'
  if (path.endsWith('.webp')) return 'image/webp'
  if (path.endsWith('.gif')) return 'image/gif'
  return fallback
}

/**
 * Decode sheet media; downscale huge sources so stage/marquee decode stays cheap.
 * Returns object URL + natural size of the (possibly resized) bitmap.
 */
const prepareDisplayImage = async (blob, type) => {
  const rawUrl = URL.createObjectURL(new Blob([blob], { type }))
  try {
    const img = await loadDecodedImage(rawUrl)
    const nw = img.naturalWidth || DEFAULT_ICON_WIDTH
    const nh = img.naturalHeight || DEFAULT_ICON_WIDTH
    const maxSide = Math.max(nw, nh)

    if (maxSide <= MAX_ICON_SOURCE_PX) {
      objectUrls.push(rawUrl)
      return { src: rawUrl, naturalWidth: nw, naturalHeight: nh }
    }

    const scale = MAX_ICON_SOURCE_PX / maxSide
    const w = Math.max(1, Math.round(nw * scale))
    const h = Math.max(1, Math.round(nh * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, w, h)
    URL.revokeObjectURL(rawUrl)

    const outBlob = await new Promise((resolve) => {
      canvas.toBlob(
        (webpBlob) => {
          if (webpBlob) resolve(webpBlob)
          else canvas.toBlob((pngBlob) => resolve(pngBlob), 'image/png')
        },
        'image/webp',
        0.86,
      )
    })
    if (!outBlob) {
      const dataUrl = canvas.toDataURL('image/png')
      return { src: dataUrl, naturalWidth: w, naturalHeight: h }
    }
    const outUrl = URL.createObjectURL(outBlob)
    objectUrls.push(outUrl)
    return { src: outUrl, naturalWidth: w, naturalHeight: h }
  } catch (error) {
    URL.revokeObjectURL(rawUrl)
    throw error
  }
}

const loadFaviconFromSheet = async () => {
  try {
    const zip = await getWorkbookZip()
    const sheetPath = await findSheetPath(zip, 'Favicon')
    const drawingPath = await findDrawingPath(zip, sheetPath)
    let imagePaths = drawingPath
      ? await findIconImagePaths(zip, drawingPath)
      : []

    if (imagePaths.length) {
      const path = imagePaths[0]
      const file = zip.file(path)
      if (file) {
        const blob = await file.async('blob')
        const type = mimeFromPath(path, blob.type || 'image/png')
        const url = URL.createObjectURL(new Blob([blob], { type }))
        objectUrls.push(url)
        const dataUrl = await prepareFaviconFromImageSrc(url, 128)
        setFaviconFromSrc(dataUrl, 'image/png')
        return
      }
    }

    const glyph = await fetchFaviconSheetGlyph()
    if (!glyph) return
    if (/^https?:\/\//i.test(glyph)) {
      const dataUrl = await prepareFaviconFromImageSrc(glyph, 128)
      setFaviconFromSrc(dataUrl, 'image/png')
      return
    }
    // Prefer SVG for emoji glyphs (crisp at all sizes), with PNG fallback set via canvas
    setFaviconFromSrc(prepareFaviconSvgDataUrl(glyph), 'image/svg+xml')
  } catch (error) {
    console.error(error)
  }
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

const applyHelperStyle = (helper) => {
  if (!helper.el) return
  const width = displayWidth(helper)
  const height = displayHeight(helper)
  helper.el.style.width = `${width}px`
  helper.el.style.height = `${height}px`
  helper.el.style.transform = `translate3d(${helper.x}px, ${helper.y}px, 0)`
  helper.el.style.zIndex = String(helper.z ?? 1)
}

const placeHelper = (helper, x, y) => {
  const stage = stageEl
  if (!stage) return
  const width = displayWidth(helper)
  const height = displayHeight(helper)
  helper.width = width
  helper.height = height
  const maxX = Math.max(0, stage.clientWidth - width)
  const maxY = Math.max(0, stage.clientHeight - height)
  helper.x = clamp(x, 0, maxX)
  helper.y = clamp(y, 0, maxY)
  applyHelperStyle(helper)
}

const centerPrimaryHelper = () => {
  const stage = stageEl
  const primary = helpers.find((helper) => helper.isPrimary) || helpers[0]
  if (!stage || !primary) return
  const width = displayWidth(primary)
  const height = displayHeight(primary)
  placeHelper(
    primary,
    (stage.clientWidth - width) / 2,
    (stage.clientHeight - height) / 2,
  )
}

const rectsOverlap = (a, b, gap = 8) =>
  a.x < b.x + b.width + gap &&
  a.x + a.width + gap > b.x &&
  a.y < b.y + b.height + gap &&
  a.y + a.height + gap > b.y

const placeHelpersInitially = () => {
  if (isNarrow) return
  const stage = stageEl
  if (!stage || !helpers.length) return

  const placed = []
  centerPrimaryHelper()
  const primary = helpers.find((helper) => helper.isPrimary) || helpers[0]
  if (primary) {
    placed.push({
      x: primary.x,
      y: primary.y,
      width: displayWidth(primary),
      height: displayHeight(primary),
    })
  }

  helpers.forEach((helper) => {
    if (helper.isPrimary || helper === primary) return

    const width = displayWidth(helper)
    const height = displayHeight(helper)
    const maxX = Math.max(0, stage.clientWidth - width)
    const maxY = Math.max(0, stage.clientHeight - height)
    let x = 0
    let y = 0
    let found = false

    for (let attempt = 0; attempt < 80; attempt += 1) {
      x = Math.random() * maxX
      y = Math.random() * maxY
      const candidate = {
        x,
        y,
        width,
        height,
      }
      if (!placed.some((rect) => rectsOverlap(candidate, rect))) {
        found = true
        break
      }
    }

    if (!found) {
      const stepX = Math.max(24, width / 2)
      const stepY = Math.max(24, height / 2)
      outer: for (let gy = 0; gy <= maxY; gy += stepY) {
        for (let gx = 0; gx <= maxX; gx += stepX) {
          const candidate = {
            x: gx,
            y: gy,
            width,
            height,
          }
          if (!placed.some((rect) => rectsOverlap(candidate, rect))) {
            x = gx
            y = gy
            found = true
            break outer
          }
        }
      }
    }

    placeHelper(helper, x, y)
    placed.push({
      x: helper.x,
      y: helper.y,
      width,
      height,
    })
  })
}

const onStageLayoutChange = () => {
  if (isNarrow) return
  centerPrimaryHelper()
  for (const helper of helpers) {
    if (helper.isPrimary) continue
    placeHelper(helper, helper.x, helper.y)
  }
}

const onMobileChange = () => {
  isMobile = mobileMq?.matches ?? false
  if (!isNarrow) onStageLayoutChange()
}

const onNarrowChange = () => {
  isNarrow = narrowMq?.matches ?? false
  if (isNarrow) {
    drag = null
    stageEl?.classList.remove('select-none')
    return
  }
  requestAnimationFrame(() => {
    placeHelpersInitially()
  })
}

const setDraggingUi = (active) => {
  if (!stageEl) return
  stageEl.classList.toggle('select-none', active)
}

const onPointerDown = (event, helper) => {
  if (isNarrow) return
  if (event.button !== 0) return
  event.preventDefault()
  const stage = stageEl
  if (!stage) return

  zCounter += 1
  helper.z = zCounter
  applyHelperStyle(helper)

  const rect = stage.getBoundingClientRect()
  drag = {
    id: helper.id,
    offsetX: event.clientX - rect.left - helper.x,
    offsetY: event.clientY - rect.top - helper.y,
  }
  helper.el.classList.remove('cursor-grab')
  helper.el.classList.add('cursor-grabbing')
  setDraggingUi(true)
  event.currentTarget.setPointerCapture(event.pointerId)
}

const onPointerMove = (event) => {
  if (!drag) return
  const stage = stageEl
  if (!stage) return
  const helper = helpers.find((item) => item.id === drag.id)
  if (!helper) return

  const rect = stage.getBoundingClientRect()
  placeHelper(
    helper,
    event.clientX - rect.left - drag.offsetX,
    event.clientY - rect.top - drag.offsetY,
  )
}

const onPointerUp = () => {
  if (drag) {
    const helper = helpers.find((item) => item.id === drag.id)
    if (helper?.el) {
      helper.el.classList.remove('cursor-grabbing')
      helper.el.classList.add('cursor-grab')
    }
  }
  drag = null
  setDraggingUi(false)
}

const createStageIconEl = (helper) => {
  const img = document.createElement('img')
  img.src = helper.src
  img.alt = ''
  img.setAttribute('aria-hidden', 'true')
  img.draggable = false
  img.dataset.stageIcon = helper.id
  img.className =
    'absolute top-0 left-0 block touch-none select-none cursor-grab'
  helper.el = img
  applyHelperStyle(helper)

  img.addEventListener('pointerdown', (event) => onPointerDown(event, helper))
  img.addEventListener('pointermove', onPointerMove)
  img.addEventListener('pointerup', onPointerUp)
  img.addEventListener('pointercancel', onPointerUp)
  return img
}

const mountStageIcons = () => {
  const stage = stageEl
  if (!stage) return

  // Keep the H1; replace only prior icon images.
  for (const img of stage.querySelectorAll('img[data-stage-icon]')) {
    img.remove()
  }

  const h1 = stage.querySelector('h1')
  for (const helper of helpers) {
    const img = createStageIconEl(helper)
    if (h1) stage.insertBefore(img, h1)
    else stage.appendChild(img)
  }
}

/** Progressive: add icons that are not yet on the stage without wiping existing ones. */
const ensureStageIconsMounted = () => {
  const stage = stageEl
  if (!stage || isNarrow) return
  const h1 = stage.querySelector('h1')
  for (const helper of helpers) {
    if (helper.el && stage.contains(helper.el)) {
      applyHelperStyle(helper)
      continue
    }
    const img = createStageIconEl(helper)
    if (h1) stage.insertBefore(img, h1)
    else stage.appendChild(img)
  }
}

const buildHelperFromMedia = async (zip, path, index) => {
  const file = zip.file(path)
  if (!file) return null
  const blob = await file.async('blob')
  const type = mimeFromPath(path, blob.type || 'image/png')
  const prepared = await prepareDisplayImage(blob, type)
  const baseWidth = DEFAULT_ICON_WIDTH
  const baseHeight =
    Math.round(
      (baseWidth * prepared.naturalHeight) / Math.max(1, prepared.naturalWidth),
    ) || baseWidth
  const marqueeHeight = MARQUEE_ICON_HEIGHT
  const marqueeWidth = Math.max(
    1,
    Math.round(
      (marqueeHeight * prepared.naturalWidth) /
        Math.max(1, prepared.naturalHeight),
    ),
  )
  return {
    id: `icon-${index}-${path.split('/').pop()}`,
    src: prepared.src,
    naturalWidth: prepared.naturalWidth,
    naturalHeight: prepared.naturalHeight,
    marqueeWidth,
    marqueeHeight,
    baseWidth,
    baseHeight,
    width: Math.round(baseWidth * iconScale()),
    height: Math.round(baseHeight * iconScale()),
    x: 0,
    y: 0,
    isPrimary: index === 0,
    z: 1,
    el: null,
  }
}

const loadIconsFromSheet = async () => {
  const t0 = performance.now()
  const zip = await getWorkbookZip()

  const sheetPath = await findIconsSheetPath(zip)
  const drawingPath = await findDrawingPath(zip, sheetPath)
  let imagePaths = drawingPath
    ? await findIconImagePaths(zip, drawingPath)
    : []

  if (!imagePaths.length) {
    imagePaths = Object.keys(zip.files)
      .filter((path) => path.startsWith('xl/media/'))
      .sort()
  }

  if (!imagePaths.length) {
    helpers = []
    setDesktopLoading(false)
    return
  }

  // Kick all extractions in parallel; surface the primary icon as soon as it lands.
  const tasks = imagePaths.map((path, i) => buildHelperFromMedia(zip, path, i))
  const firstHelper = await tasks[0]
  if (firstHelper) {
    helpers = [firstHelper]
    ensureStageIconsMounted()
    placeHelpersInitially()
    setDesktopLoading(false)
    console.info(
      `[perf] time-to-first-icon (from page init): ${(performance.now() - initStartedAt).toFixed(0)}ms`,
    )
    perfMark('first icon ready (from loadIcons start)', t0)
  }

  const rest = await Promise.all(tasks.slice(1))
  const loaded = [firstHelper, ...rest].filter(Boolean)
  helpers = loaded
  ensureStageIconsMounted()
  placeHelpersInitially()
  perfMark('all icons ready (from loadIcons start)', t0)
}

const init = async () => {
  stageEl = document.getElementById('stage')
  marqueeHostEl = document.getElementById('marquee-host')
  stageLoadingEl = document.getElementById('stage-loading')
  marqueeLoadingEl = document.getElementById('marquee-loading')
  setDesktopLoading(true)
  setMarqueeLoading(true)

  mobileMq = window.matchMedia(MOBILE_MQ)
  isMobile = mobileMq.matches
  mobileMq.addEventListener('change', onMobileChange)
  narrowMq = window.matchMedia(NARROW_MQ)
  isNarrow = narrowMq.matches
  narrowMq.addEventListener('change', onNarrowChange)
  window.addEventListener('resize', onStageLayoutChange)

  // Warm the shared xlsx immediately alongside CSV lists (no sequential waterfall).
  const workbookWarm = getWorkbookZip().catch((error) => {
    console.error(error)
    return null
  })
  const listsP = loadLists()
  const iconsP = loadIconsFromSheet()
  // Favicon shares the workbook; never gate stage/marquee on it.
  const faviconP = loadFaviconFromSheet()

  try {
    await Promise.all([listsP, iconsP, workbookWarm])
  } catch (error) {
    console.error(error)
  }

  // Mount marquee once after Contact + icons settle (favicon may still be in flight).
  await prepareMarqueeOnce()
  faviconP.catch((error) => console.error(error))
}

init()

window.addEventListener('pagehide', () => {
  mobileMq?.removeEventListener('change', onMobileChange)
  narrowMq?.removeEventListener('change', onNarrowChange)
  window.removeEventListener('resize', onStageLayoutChange)
  for (const url of objectUrls) URL.revokeObjectURL(url)
})
