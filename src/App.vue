<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import JSZip from 'jszip'

const SHEET_ID = '1PIcdiUt1_Yj9Mf1zErlEPObBl5Kg6W5Z3Qd5p54-WRE'
const DEFAULT_ICON_WIDTH = 160
const MOBILE_MQ = '(max-width: 767px)'
const BIO_TEXT =
  'Sarah Fensom is a film and arts journalist based in Los Angeles. With over 15 years of experience as a writer, she has contributed to the Los Angeles Times, American Cinematographer, BOMB, Sight and Sound, LA Review of Books, Film Comment, and a host of other publications. She is the co-writer and star of Lindsay Denniberg’s forthcoming film, Killer Makeover and a uniquely glamorous person.'
const EVENTS_ERROR_MSG = 'Couldn’t load events — try refreshing'
const WORK_ERROR_MSG = 'Couldn’t load works — try refreshing'

const sheetCsvUrl = (sheetName) =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`
const sheetXlsxUrl = () =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`

const events = ref([])
const work = ref([])
const eventsError = ref('')
const workError = ref('')
const helpers = ref([])
const objectUrls = []
const isMobile = ref(false)
let mobileMq = null

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

const loadLists = async () => {
  const [eventsResult, workResult] = await Promise.allSettled([
    fetchSheet('Events', ['location', 'publication']),
    fetchSheet('Work', ['publication', 'location']),
  ])

  if (eventsResult.status === 'fulfilled') {
    events.value = eventsResult.value
    eventsError.value = ''
  } else {
    events.value = []
    eventsError.value = EVENTS_ERROR_MSG
    console.error(eventsResult.reason)
  }

  if (workResult.status === 'fulfilled') {
    work.value = workResult.value
    workError.value = ''
  } else {
    work.value = []
    workError.value = WORK_ERROR_MSG
    console.error(workResult.reason)
  }
}

const listLinkLabel = (item) =>
  `${item.date}: ${item.title} for ${item.credit} (opens in a new tab)`

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

const findIconsSheetPath = async (zip) => {
  const workbook = await readZipText(zip, 'xl/workbook.xml')
  const rels = parseRelationships(
    await readZipText(zip, 'xl/_rels/workbook.xml.rels'),
  )
  const sheetMatch = workbook.match(/<sheet\b[^>]*name="Icons"[^>]*\/?>/)
  if (!sheetMatch) throw new Error('Icons sheet not found')
  const rid = attr(sheetMatch[0], 'r:id')
  const target = rid && rels[rid]
  if (!target) throw new Error('Icons worksheet relationship missing')
  return resolveZipPath('xl/workbook.xml', target)
}

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
  const drawingXml = await readZipText(zip, drawingPath)
  const drawingRels = parseRelationships(await readZipText(zip, drawingRelsPath))

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
  link.href = src
}

const iconScale = computed(() => (isMobile.value ? 0.5 : 1))

const displayWidth = (helper) =>
  Math.round(helper.baseWidth * iconScale.value)
const displayHeight = (helper) =>
  Math.round(helper.baseHeight * iconScale.value)

const loadIconsFromSheet = async () => {
  const response = await fetch(sheetXlsxUrl())
  if (!response.ok) throw new Error('Failed to load Icons workbook')
  const zip = await JSZip.loadAsync(await response.arrayBuffer())

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

  const loaded = []
  for (let i = 0; i < imagePaths.length; i += 1) {
    const path = imagePaths[i]
    const file = zip.file(path)
    if (!file) continue
    const blob = await file.async('blob')
    const type =
      path.endsWith('.png')
        ? 'image/png'
        : path.endsWith('.jpg') || path.endsWith('.jpeg')
          ? 'image/jpeg'
          : path.endsWith('.webp')
            ? 'image/webp'
            : blob.type || 'image/png'
    const url = URL.createObjectURL(new Blob([blob], { type }))
    objectUrls.push(url)
    const natural = await loadImageNaturalSize(url)
    const baseWidth = DEFAULT_ICON_WIDTH
    const baseHeight =
      Math.round((baseWidth * natural.height) / natural.width) || baseWidth
    loaded.push({
      id: `icon-${i}-${path.split('/').pop()}`,
      src: url,
      baseWidth,
      baseHeight,
      width: Math.round(baseWidth * iconScale.value),
      height: Math.round(baseHeight * iconScale.value),
      x: 0,
      y: 0,
      isPrimary: i === 0,
    })
  }

  helpers.value = loaded
  if (loaded[0]) setFaviconFromSrc(loaded[0].src)
  await nextTick()
  placeHelpersInitially()
}

const stageRef = ref(null)
const drag = ref(null)
let zCounter = 1

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

const placeHelper = (helper, x, y) => {
  const stage = stageRef.value
  if (!stage) return
  const width = displayWidth(helper)
  const height = displayHeight(helper)
  helper.width = width
  helper.height = height
  const maxX = Math.max(0, stage.clientWidth - width)
  const maxY = Math.max(0, stage.clientHeight - height)
  helper.x = clamp(x, 0, maxX)
  helper.y = clamp(y, 0, maxY)
}

const centerPrimaryHelper = () => {
  const stage = stageRef.value
  const primary = helpers.value.find((helper) => helper.isPrimary) || helpers.value[0]
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
  const stage = stageRef.value
  if (!stage || !helpers.value.length) return

  const placed = []
  centerPrimaryHelper()
  const primary = helpers.value.find((helper) => helper.isPrimary) || helpers.value[0]
  if (primary) {
    placed.push({
      x: primary.x,
      y: primary.y,
      width: displayWidth(primary),
      height: displayHeight(primary),
    })
  }

  helpers.value.forEach((helper) => {
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
  centerPrimaryHelper()
  for (const helper of helpers.value) {
    if (helper.isPrimary) continue
    placeHelper(helper, helper.x, helper.y)
  }
}

const onMobileChange = () => {
  isMobile.value = mobileMq?.matches ?? false
  onStageLayoutChange()
}

const helperStyle = (helper) => ({
  width: `${displayWidth(helper)}px`,
  height: `${displayHeight(helper)}px`,
  transform: `translate3d(${helper.x}px, ${helper.y}px, 0)`,
  zIndex: helper.z ?? 1,
})

const onPointerDown = (event, helper) => {
  if (helper.isPrimary) return
  if (event.button !== 0) return
  event.preventDefault()
  const stage = stageRef.value
  if (!stage) return

  zCounter += 1
  helper.z = zCounter

  const rect = stage.getBoundingClientRect()
  drag.value = {
    id: helper.id,
    offsetX: event.clientX - rect.left - helper.x,
    offsetY: event.clientY - rect.top - helper.y,
  }
  event.currentTarget.setPointerCapture(event.pointerId)
}

const onPointerMove = (event) => {
  if (!drag.value) return
  const stage = stageRef.value
  if (!stage) return
  const helper = helpers.value.find((item) => item.id === drag.value.id)
  if (!helper || helper.isPrimary) return

  const rect = stage.getBoundingClientRect()
  placeHelper(
    helper,
    event.clientX - rect.left - drag.value.offsetX,
    event.clientY - rect.top - drag.value.offsetY,
  )
}

const onPointerUp = () => {
  drag.value = null
}

const isDragging = computed(() => drag.value !== null)

onMounted(async () => {
  mobileMq = window.matchMedia(MOBILE_MQ)
  isMobile.value = mobileMq.matches
  mobileMq.addEventListener('change', onMobileChange)
  window.addEventListener('resize', onStageLayoutChange)
  try {
    await Promise.all([loadLists(), loadIconsFromSheet()])
  } catch (error) {
    console.error(error)
  }
})

onUnmounted(() => {
  mobileMq?.removeEventListener('change', onMobileChange)
  window.removeEventListener('resize', onStageLayoutChange)
  for (const url of objectUrls) URL.revokeObjectURL(url)
})
</script>

<template>
  <main
    class="flex h-dvh w-full overflow-hidden font-['Times_New_Roman',Times,serif] text-[12px] leading-normal"
  >
    <!-- Left: gray; Contact, Events, Work — shared scroll pattern -->
    <div class="flex h-full min-h-0 w-1/2 flex-col bg-neutral-200">
      <section
        class="max-h-[40%] shrink-0 overflow-y-auto border-b border-black p-4"
        aria-labelledby="contact-heading"
      >
        <h2 id="contact-heading" class="mb-3">Contact</h2>
        <ul class="space-y-1">
          <li class="max-md:mb-2">
            <a
              href="mailto:sefensom@gmail.com"
              class="text-[#0000EE] underline"
            >
              sefensom@gmail.com
            </a>
          </li>
          <li class="max-md:mb-2">
            <p class="m-0">{{ BIO_TEXT }}</p>
          </li>
          <li class="max-md:mb-2">
            <a
              href="https://www.instagram.com/mycharades_grease2/"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex min-h-6 min-w-6 items-center text-[#0000EE]"
              aria-label="Instagram (opens in a new tab)"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="currentColor"
                aria-hidden="true"
                class="shrink-0"
              >
                <path
                  d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7zm5 3.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 0 1 12 7.5zm0 2A2.5 2.5 0 1 0 14.5 12 2.5 2.5 0 0 0 12 9.5zM17.75 6a1.25 1.25 0 1 1-1.25 1.25A1.25 1.25 0 0 1 17.75 6z"
                />
              </svg>
            </a>
          </li>
        </ul>
      </section>
      <section
        class="flex min-h-0 flex-[1_1_0%] flex-col overflow-hidden border-b border-black p-4"
      >
        <h2 class="mb-3 shrink-0">Events</h2>
        <p
          v-if="eventsError"
          class="m-0 min-h-0 flex-1 overflow-y-auto"
          role="status"
          aria-live="polite"
        >
          {{ eventsError }}
        </p>
        <ul
          v-else
          class="min-h-0 flex-1 space-y-0 overflow-y-auto overscroll-contain"
        >
          <li
            v-for="item in events"
            :key="item.date + item.title"
            class="max-md:mb-2"
          >
            <a
              :href="item.url"
              target="_blank"
              rel="noopener noreferrer"
              class="block min-h-6 leading-6 text-[#0000EE] underline"
              :aria-label="listLinkLabel(item)"
            >
              {{ item.date }}: {{ item.title }} <i>for {{ item.credit }}</i>
            </a>
          </li>
        </ul>
      </section>
      <section
        class="flex min-h-0 flex-[4_1_0%] flex-col overflow-hidden p-4"
      >
        <h2 class="mb-3 shrink-0">Work</h2>
        <p
          v-if="workError"
          class="m-0 min-h-0 flex-1 overflow-y-auto"
          role="status"
          aria-live="polite"
        >
          {{ workError }}
        </p>
        <ul
          v-else
          class="min-h-0 flex-1 space-y-0 overflow-y-auto overscroll-contain"
        >
          <li
            v-for="item in work"
            :key="item.date + item.title"
            class="max-md:mb-2"
          >
            <a
              :href="item.url"
              target="_blank"
              rel="noopener noreferrer"
              class="block min-h-6 leading-6 text-[#0000EE] underline"
              :aria-label="listLinkLabel(item)"
            >
              {{ item.date }}: {{ item.title }} <i>for {{ item.credit }}</i>
            </a>
          </li>
        </ul>
      </section>
    </div>

    <!-- Right: white stage for helpers -->
    <div
      ref="stageRef"
      class="relative h-full w-1/2 overflow-hidden bg-white"
      :class="isDragging ? 'select-none' : ''"
    >
      <img
        v-for="helper in helpers"
        :key="helper.id"
        :src="helper.src"
        alt=""
        aria-hidden="true"
        :style="helperStyle(helper)"
        class="absolute top-0 left-0 block touch-none select-none"
        :class="
          helper.isPrimary
            ? 'cursor-default'
            : drag?.id === helper.id
              ? 'cursor-grabbing'
              : 'cursor-grab'
        "
        draggable="false"
        @pointerdown="onPointerDown($event, helper)"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      />

      <h1
        class="absolute right-4 bottom-4 z-50 m-0 text-right font-['Times_New_Roman',Times,serif] text-[34px] leading-tight"
      >
        Sarah Fensom
      </h1>
    </div>
  </main>
</template>
