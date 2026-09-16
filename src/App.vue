<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import JSZip from 'jszip'

const SHEET_ID = '1PIcdiUt1_Yj9Mf1zErlEPObBl5Kg6W5Z3Qd5p54-WRE'
const DEFAULT_ICON_WIDTH = 160
const sheetCsvUrl = (sheetName) =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`
const sheetXlsxUrl = () =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`

const events = ref([])
const work = ref([])
const helpers = ref([])
const objectUrls = []

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
  const [eventRows, workRows] = await Promise.all([
    fetchSheet('Events', ['location', 'publication']),
    fetchSheet('Work', ['publication', 'location']),
  ])
  events.value = eventRows
  work.value = workRows
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
    const width = DEFAULT_ICON_WIDTH
    const height = Math.round((width * natural.height) / natural.width) || width
    loaded.push({
      id: `icon-${i}-${path.split('/').pop()}`,
      src: url,
      alt: `Icon ${i + 1}`,
      width,
      height,
      x: 0,
      y: 0,
    })
  }

  helpers.value = loaded
  await nextTick()
  placeHelpersInitially()
}

const hovering = ref(false)
const pinned = ref(false)

const showAbout = () => hovering.value || pinned.value

const toggleAbout = () => {
  pinned.value = !pinned.value
}

const stageRef = ref(null)
const drag = ref(null)
let zCounter = 1

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

const placeHelper = (helper, x, y) => {
  const stage = stageRef.value
  if (!stage) return
  const maxX = Math.max(0, stage.clientWidth - helper.width)
  const maxY = Math.max(0, stage.clientHeight - helper.height)
  helper.x = clamp(x, 0, maxX)
  helper.y = clamp(y, 0, maxY)
}

const placeHelpersInitially = () => {
  const stage = stageRef.value
  if (!stage || !helpers.value.length) return

  const count = helpers.value.length
  helpers.value.forEach((helper, index) => {
    const offsetX = (index - (count - 1) / 2) * 48
    const offsetY = (index - (count - 1) / 2) * 36
    placeHelper(
      helper,
      (stage.clientWidth - helper.width) / 2 + offsetX,
      (stage.clientHeight - helper.height) / 2 + offsetY,
    )
  })
}

const clampHelpersToStage = () => {
  for (const helper of helpers.value) {
    placeHelper(helper, helper.x, helper.y)
  }
}

const helperStyle = (helper) => ({
  width: `${helper.width}px`,
  height: `${helper.height}px`,
  transform: `translate3d(${helper.x}px, ${helper.y}px, 0)`,
  zIndex: helper.z ?? 1,
})

const onPointerDown = (event, helper) => {
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
  if (!helper) return

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
  window.addEventListener('resize', clampHelpersToStage)
  try {
    await Promise.all([loadLists(), loadIconsFromSheet()])
  } catch (error) {
    console.error(error)
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', clampHelpersToStage)
  for (const url of objectUrls) URL.revokeObjectURL(url)
})
</script>

<template>
  <div
    class="flex h-dvh w-full overflow-hidden font-['Times_New_Roman',Times,serif] text-[12px] leading-normal"
  >
    <!-- Left: gray, split horizontally -->
    <div class="flex h-full w-1/2 flex-col bg-neutral-200">
      <section
        class="flex min-h-0 flex-1 flex-col overflow-hidden border-b border-black p-4"
      >
        <h2 class="mb-3 shrink-0">Events</h2>
        <ul class="min-h-0 flex-1 space-y-1 overflow-y-auto">
          <li v-for="item in events" :key="item.date + item.title">
            <a
              :href="item.url"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[#0000EE] underline"
            >
              {{ item.date }}: {{ item.title }} <i>for {{ item.credit }}</i>
            </a>
          </li>
        </ul>
      </section>
      <section class="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
        <h2 class="mb-3 shrink-0">Work</h2>
        <ul class="min-h-0 flex-1 space-y-1 overflow-y-auto">
          <li v-for="item in work" :key="item.date + item.title">
            <a
              :href="item.url"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[#0000EE] underline"
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
      <p
        v-show="showAbout()"
        class="pointer-events-none absolute top-4 right-4 left-4 z-50 text-right text-[12px] leading-normal"
      >
        Sarah Fensom is a film and arts journalist based in Los Angeles. With
        over 15 years of experience as a writer, she has contributed to the Los
        Angeles Times, American Cinematographer, BOMB, Sight and Sound, LA
        Review of Books, Film Comment, and a host of other publications. She is
        the co-writer and star of Lindsay Denniberg’s forthcoming film, Killer
        Makeover and a uniquely glamorous person.
      </p>

      <img
        v-for="helper in helpers"
        :key="helper.id"
        :src="helper.src"
        :alt="helper.alt"
        :style="helperStyle(helper)"
        class="absolute top-0 left-0 block touch-none select-none"
        :class="
          drag?.id === helper.id ? 'cursor-grabbing' : 'cursor-grab'
        "
        draggable="false"
        @pointerdown="onPointerDown($event, helper)"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      />

      <button
        type="button"
        class="absolute right-4 bottom-4 z-50 cursor-pointer border-0 bg-transparent p-0 text-right font-['Times_New_Roman',Times,serif] text-[34px] leading-tight"
        :aria-expanded="showAbout()"
        @mouseenter="hovering = true"
        @mouseleave="hovering = false"
        @click="toggleAbout"
      >
        Sarah Fensom
      </button>
    </div>
  </div>
</template>
