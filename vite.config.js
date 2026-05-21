import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/readbook/',
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
  },
});
