<script setup>
const events = [
  { date: '09.01.2026', title: 'Opening Reception', publication: 'Artforum' },
  { date: '08.22.2026', title: 'Artist Talk', publication: 'MoMA' },
  { date: '08.12.2026', title: 'Panel Discussion', publication: 'Frieze' },
  { date: '07.30.2026', title: 'Gallery Walkthrough', publication: 'The Whitney' },
  { date: '07.18.2026', title: 'Reading', publication: 'Printed Matter' },
  { date: '07.04.2026', title: 'Book Launch', publication: 'The New Yorker' },
  { date: '06.28.2026', title: 'Screening', publication: 'Anthology Film Archives' },
  { date: '06.15.2026', title: 'Symposium', publication: 'Harvard GSD' },
  { date: '06.02.2026', title: 'Performance', publication: 'The Kitchen' },
  { date: '05.21.2026', title: 'Conversation', publication: 'Dia Art Foundation' },
  { date: '05.09.2026', title: 'Lecture', publication: 'Cooper Union' },
  { date: '04.27.2026', title: 'Roundtable', publication: 'e-flux' },
  { date: '04.14.2026', title: 'Workshop', publication: 'Pioneer Works' },
  { date: '04.01.2026', title: 'Opening Night', publication: 'New Museum' },
  { date: '03.19.2026', title: 'Q&A', publication: 'Film Forum' },
  { date: '03.07.2026', title: 'Book Signing', publication: 'McNally Jackson' },
  { date: '02.22.2026', title: 'In Conversation', publication: 'Aperture' },
  { date: '02.10.2026', title: 'Salon', publication: 'Hauser & Wirth' },
  { date: '01.28.2026', title: 'Preview', publication: 'Gagosian' },
  { date: '01.15.2026', title: 'Public Program', publication: 'The Met' },
  { date: '12.20.2025', title: 'Holiday Open Studio', publication: 'PS1' },
  { date: '12.05.2025', title: 'Year-End Review', publication: 'Hyperallergic' },
  { date: '11.18.2025', title: 'Forum', publication: 'Brooklyn Museum' },
  { date: '11.02.2025', title: 'Closing Reception', publication: 'Sadie Coles' },
]

const work = [
  { date: '06.20.2026', title: 'Portrait Series', publication: 'Aperture' },
  { date: '06.01.2026', title: 'Editorial Feature', publication: 'Vogue' },
  { date: '05.18.2026', title: 'Cover Story', publication: 'The Cut' },
  { date: '05.08.2026', title: 'Studio Visit', publication: 'Mousse' },
  { date: '04.25.2026', title: 'Photo Essay', publication: 'The New York Times' },
  { date: '04.10.2026', title: 'Profile', publication: 'The Paris Review' },
  { date: '03.28.2026', title: 'Interview', publication: 'BOMB' },
  { date: '03.15.2026', title: 'Commission', publication: 'Wallpaper*' },
  { date: '03.01.2026', title: 'Lookbook', publication: 'Acne Studios' },
  { date: '02.14.2026', title: 'Campaign', publication: 'COS' },
  { date: '01.30.2026', title: 'Exhibition Catalog', publication: 'Phaidon' },
  { date: '01.12.2026', title: 'Documentary Stills', publication: 'Criterion' },
  { date: '12.18.2025', title: 'Seasonal Edit', publication: 'SSENSE' },
  { date: '12.02.2025', title: 'Artist Book', publication: 'Primary Information' },
  { date: '11.20.2025', title: 'Installation Views', publication: 'Contemporary Art Daily' },
  { date: '11.05.2025', title: 'Fashion Story', publication: 'i-D' },
  { date: '10.22.2025', title: 'Architecture Feature', publication: 'Dezeen' },
  { date: '10.08.2025', title: 'Travel Diary', publication: 'Apartamento' },
  { date: '09.24.2025', title: 'Monograph Spread', publication: 'Steidl' },
  { date: '09.10.2025', title: 'Still Life Series', publication: 'Kinfolk' },
  { date: '08.27.2025', title: 'City Guide', publication: 'Cereal' },
  { date: '08.12.2025', title: 'Brand Film', publication: 'Nike' },
  { date: '07.29.2025', title: 'Archive Project', publication: 'MoMA Library' },
  { date: '07.15.2025', title: 'Collaboration', publication: 'Supreme' },
]
</script>

<template>
  <div
    class="flex h-dvh w-full overflow-hidden font-['Times_New_Roman',Times,serif] text-[12px] leading-normal"
  >
    <!-- Left: gray, split horizontally -->
    <div class="flex h-full w-1/2 flex-col bg-neutral-300">
      <h1 class="shrink-0 px-4 pt-4 pb-3 text-left text-[34px] leading-tight">
        Sarah Fensom
      </h1>
      <section
        class="flex min-h-0 flex-[2] flex-col overflow-hidden border-b border-black px-4 pb-4"
      >
        <h2 class="mb-3 shrink-0">Events</h2>
        <ul class="min-h-0 flex-1 space-y-1 overflow-y-auto">
          <li v-for="item in events" :key="item.date + item.title">
            <a
              href="#"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[#0000EE] underline"
            >
              {{ item.date }}-{{ item.title }} <i>for {{ item.publication }}</i>
            </a>
          </li>
        </ul>
      </section>
      <section class="flex min-h-0 flex-[3] flex-col overflow-hidden p-4">
        <h2 class="mb-3 shrink-0">Work</h2>
        <ul class="min-h-0 flex-1 space-y-1 overflow-y-auto">
          <li v-for="item in work" :key="item.date + item.title">
            <a
              href="#"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[#0000EE] underline"
            >
              {{ item.date }}-{{ item.title }} <i>for {{ item.publication }}</i>
            </a>
          </li>
        </ul>
      </section>
    </div>

    <!-- Right: white -->
    <div class="h-full w-1/2 overflow-hidden bg-white p-4 text-right">
      <p class="text-[12px] leading-normal">
        Sarah Fensom is a film and arts journalist based in Los Angeles. With
        over 15 years of experience as a writer, she has contributed to the Los
        Angeles Times, American Cinematographer, BOMB, Sight and Sound, LA
        Review of Books, Film Comment, and a host of other publications. She is
        the co-writer and star of Lindsay Denniberg’s forthcoming film, Killer
        Makeover and a uniquely glamorous person. She is married to writer and
        filmmaker Chris Shields.
      </p>
    </div>
  </div>
</template>
