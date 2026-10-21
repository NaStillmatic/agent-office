import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { agentOfficePlugin } from './server/plugin'

export default defineConfig({
  plugins: [vue(), agentOfficePlugin()],
  server: {
    // 다른 vite 프로젝트(기본 5173)와 겹치지 않게 고정한다. 이미 쓰이고 있으면 다른 포트로 넘어가지 않고 실패한다
    host: 'localhost',
    port: 5180,
    strictPort: true,
  },
})
