import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, proxy API + Socket.IO to the backend. In the Docker build we serve
// static files via nginx and connect to the backend by its service URL.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:8000',
      '/socket.io': { target: 'http://localhost:8000', ws: true },
    },
  },
})
