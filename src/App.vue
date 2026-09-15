<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'

const SHEET_ID = '1PIcdiUt1_Yj9Mf1zErlEPObBl5Kg6W5Z3Qd5p54-WRE'
const sheetCsvUrl = (sheetName) =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`

const events = ref([])
const work = ref([])

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

const hovering = ref(false)
const pinned = ref(false)

const showAbout = () => hovering.value || pinned.value

const toggleAbout = () => {
  pinned.value = !pinned.value
}

const asset = (file) => `${import.meta.env.BASE_URL}${file}`

/** Icons on the white panel. Add more entries here later. */
const helpers = ref([
  {
    id: 'ms-piggy',
    src: asset('ms-piggy.png'),
    alt: 'Miss Piggy',
    width: 160,
    height: Math.round((160 * 573) / 435),
    x: 0,
    y: 0,
  },
])

const stageRef = ref(null)
const drag = ref(null)
let zCounter = 1
let didPlace = false

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
  if (!stage || didPlace) return
  didPlace = true

  const piggy = helpers.value.find((item) => item.id === 'ms-piggy')
  if (piggy) {
    placeHelper(
      piggy,
      (stage.clientWidth - piggy.width) / 2,
      (stage.clientHeight - piggy.height) / 2,
    )
  }
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
  await nextTick()
  placeHelpersInitially()
  window.addEventListener('resize', clampHelpersToStage)
  try {
    await loadLists()
  } catch (error) {
    console.error(error)
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', clampHelpersToStage)
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
              {{ item.date }} {{ item.title }} <i>for {{ item.credit }}</i>
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
              {{ item.date }} {{ item.title }} <i>for {{ item.credit }}</i>
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
