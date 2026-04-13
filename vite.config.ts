import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  root: 'src/client',
  publicDir: false,
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/client/index.html'),
        player: resolve(__dirname, 'src/client/player.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/client'),
    },
  },
  server: {
    allowedHosts: [
        'dev.awoo.red'
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:4529',
        timeout: 0, // No timeout for large uploads + compression
      },
      '/ws': {
        target: 'ws://localhost:4529',
        ws: true,
      },
    },
  },
})
