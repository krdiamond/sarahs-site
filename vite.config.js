import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// Project Pages URL is https://krdiamond.github.io/portfolio/
export default defineConfig({
  base: '/portfolio/',
  plugins: [vue(), tailwindcss()],
})
