import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// Project Pages URL is https://krdiamond.github.io/sarahs-site/
// This HTML-ONLY branch is for local preview only — do not merge to main.
export default defineConfig({
  base: '/sarahs-site/',
  plugins: [tailwindcss()],
})
