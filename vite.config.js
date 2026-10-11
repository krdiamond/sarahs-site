import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// Custom domain (sarahfensom.com) serves at site root. github.io/sarahs-site redirects once the domain is set.
export default defineConfig({
  base: '/',
  plugins: [vue(), tailwindcss()],
})
