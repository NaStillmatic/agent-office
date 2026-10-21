/**
 * 상태줄 브리지 설치·제거(선택 기능). `node scripts/statusline-install.mjs [install|uninstall]`
 * - install: 지금 상태줄 명령을 `<설정 폴더>/agent-office-statusline.json` 에 저장하고, settings.json 을 백업한 뒤
 *   statusLine 명령을 브리지(statusline-bridge.mjs)로 바꾼다. 브리지가 원래 명령을 그대로 실행하므로 상태줄 모양은 같다.
 * - uninstall: 저장해 둔 원래 명령으로 되돌린다(원래 상태줄이 없었으면 statusLine 을 지운다).
 * settings.json 의 다른 항목은 건드리지 않는다.
 */
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
const settingsFile = join(configDir, 'settings.json')
const savedFile = join(configDir, 'agent-office-statusline.json')
const bridge = resolve(dirname(fileURLToPath(import.meta.url)), 'statusline-bridge.mjs')
// 상태줄은 PATH 가 짧은 환경에서 돌 수 있어 node 를 절대 경로로 부른다
const bridgeCommand = `"${process.execPath}" "${bridge}"`

const readSettings = () => (existsSync(settingsFile) ? JSON.parse(readFileSync(settingsFile, 'utf-8')) : {})
function writeSettings(settings) {
  if (existsSync(settingsFile)) copyFileSync(settingsFile, `${settingsFile}.agent-office-backup`)
  writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n')
}

const mode = process.argv[2] ?? 'install'
const settings = readSettings()
const current = settings.statusLine?.command

if (mode === 'install') {
  if (current === bridgeCommand) {
    console.log('[agent-office] 이미 설치되어 있습니다 / already installed')
  } else {
    writeFileSync(savedFile, JSON.stringify({ command: current ?? '' }, null, 2) + '\n')
    settings.statusLine = { ...(settings.statusLine ?? {}), type: 'command', command: bridgeCommand }
    writeSettings(settings)
    console.log('[agent-office] 상태줄 브리지를 설치했습니다 / statusline bridge installed')
    console.log(`  원래 명령 저장 / original command saved: ${savedFile}`)
    console.log(`  설정 백업 / settings backup: ${settingsFile}.agent-office-backup`)
  }
} else if (mode === 'uninstall') {
  if (current !== bridgeCommand) {
    console.log('[agent-office] 설치되어 있지 않습니다 / not installed')
  } else {
    const original = existsSync(savedFile) ? JSON.parse(readFileSync(savedFile, 'utf-8')).command : ''
    if (original) settings.statusLine = { ...settings.statusLine, command: original }
    else delete settings.statusLine
    writeSettings(settings)
    rmSync(savedFile, { force: true })
    rmSync(join(configDir, 'agent-office-usage.json'), { force: true })
    console.log('[agent-office] 원래 상태줄로 되돌렸습니다 / statusline restored')
  }
} else {
  console.error('usage: node scripts/statusline-install.mjs [install|uninstall]')
  process.exit(1)
}
