// frontend/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: '.', // keep as '.' if running from inside frontend/
  plugins: [react()],
  base: './', // ensures relative paths resolve correctly
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
})
