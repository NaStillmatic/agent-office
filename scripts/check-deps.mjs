/**
 * npm run dev 직전에 의존성이 이 컴퓨터에 맞게 설치됐는지 본다(predev).
 * - node_modules 가 없으면 vite 를 못 찾아 `vite: command not found` 가 난다.
 * - 다른 컴퓨터(예: Apple Silicon ↔ 인텔 맥)에서 node_modules 를 통째로 복사해 오면 rollup·esbuild 의
 *   플랫폼별 실행 파일이 맞지 않아 알아보기 힘든 오류가 난다.
 * 두 경우 모두 무엇을 하면 되는지 한국어·영어로 알려 주고 멈춘다. 외부 패키지 없이 node 만으로 돈다.
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function stop(reason, fix) {
  console.error(`\n[agent-office] ${reason.ko}\n               ${reason.en}\n`)
  console.error(`  ${fix}\n`)
  process.exit(1)
}

try {
  require.resolve('vite/package.json')
} catch {
  stop(
    {
      ko: '의존성이 설치되지 않았습니다. 먼저 설치해 주세요.',
      en: 'Dependencies are not installed. Install them first.',
    },
    'npm ci',
  )
}

try {
  // 둘 다 불러오는 순간 이 플랫폼용 실행 파일을 찾는다
  require('rollup/dist/native.js')
  require('esbuild')
} catch {
  stop(
    {
      ko: `node_modules 가 이 컴퓨터(${process.platform}-${process.arch})용이 아닙니다. 다른 컴퓨터에서 복사해 온 것 같습니다. 지우고 다시 설치해 주세요.`,
      en: `node_modules was not installed for this machine (${process.platform}-${process.arch}); it looks copied from another computer. Remove it and reinstall.`,
    },
    process.platform === 'win32'
      ? 'rmdir /s /q node_modules && npm ci'
      : 'rm -rf node_modules && npm ci',
  )
}
