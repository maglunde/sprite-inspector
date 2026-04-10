import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const isGitHubPagesBuild = process.env.GITHUB_PAGES === 'true'

export default defineConfig({
  base: isGitHubPagesBuild ? '/sprite-inspector/' : '/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
})
