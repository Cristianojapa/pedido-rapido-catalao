import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5174,
    host: true,
  },

  preview: {
    host: true,
    port: 5174,
    allowedHosts: [
      'pedido-rapido-catalao-pedido-rapido-catalao.f0dgeg.easypanel.host'
    ],
  },
})
