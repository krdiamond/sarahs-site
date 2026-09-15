<script setup>
const events = [
  { date: '09.01.2026', title: 'Opening Reception', publication: 'Artforum' },
  { date: '08.12.2026', title: 'Panel Discussion', publication: 'Frieze' },
  { date: '07.04.2026', title: 'Book Launch', publication: 'The New Yorker' },
]

const work = [
  { date: '06.20.2026', title: 'Portrait Series', publication: 'Aperture' },
  { date: '05.08.2026', title: 'Studio Visit', publication: 'Mousse' },
  { date: '03.15.2026', title: 'Commission', publication: 'Wallpaper*' },
]
</script>

<template>
  <div
    class="flex h-dvh w-full overflow-hidden font-['Times_New_Roman',Times,serif] text-[12px] leading-normal"
  >
    <!-- Left: gray, split horizontally -->
    <div class="flex h-full w-1/2 flex-col bg-neutral-300">
      <section class="flex min-h-0 flex-1 flex-col overflow-hidden border-b border-black p-4">
        <h1 class="mb-3">Events</h1>
        <ul class="space-y-1">
          <li v-for="item in events" :key="item.date + item.title">
            <a href="#" class="text-[#0000EE] underline">
              {{ item.date }}-{{ item.title }}-<i>for {{ item.publication }}</i>
            </a>
          </li>
        </ul>
      </section>
      <section class="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
        <h1 class="mb-3">Work</h1>
        <ul class="space-y-1">
          <li v-for="item in work" :key="item.date + item.title">
            <a href="#" class="text-[#0000EE] underline">
              {{ item.date }}-{{ item.title }}-<i>for {{ item.publication }}</i>
            </a>
          </li>
        </ul>
      </section>
    </div>

    <!-- Right: white -->
    <div class="h-full w-1/2 bg-white" />
  </div>
</template>
