import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const repoName = process.env.GITHUB_REPOSITORY?.split('/')?.[1]

// https://vitejs.dev/config/
export default defineConfig({
  // GitHub Pages 部署时使用仓库名作为 base 路径
  base: process.env.GITHUB_ACTIONS && repoName ? `/${repoName}/` : '/',
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
