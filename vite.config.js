import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// Project Pages URL is https://krdiamond.github.io/sarahs-site/
export default defineConfig({
  base: '/sarahs-site/',
  plugins: [vue(), tailwindcss()],
})
