import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Suppress warnings, only show errors
  plugins: [react()],
  resolve: {
    // same alias as jsconfig.json (previously provided by the Base44 Vite plugin)
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
