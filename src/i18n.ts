/**
 * 화면 문구 사전(한국어·영어·일본어·중국어 간체). 라이브러리 없이 사전 객체 하나로 둔다.
 * 다른 언어 사전은 `Messages`(한국어 사전의 모양) 타입이라 키를 하나라도 빠뜨리면 타입 검사가 실패한다.
 * 언어를 추가하려면 사전을 하나 더 만들고 LOCALES·LOCALE_NAMES·MESSAGES 에 넣는다(글꼴은 index.html).
 */
export type Locale = 'ko' | 'en' | 'ja' | 'zh'
export const LOCALES: readonly Locale[] = ['ko', 'en', 'ja', 'zh']
/** 언어 선택 목록에 보일 이름(각 언어 자신의 표기) */
export const LOCALE_NAMES: Record<Locale, string> = {
  ko: '한국어',
  en: 'English',
  ja: '日本語',
  zh: '中文',
}
/** <html lang> 값 */
export const HTML_LANG: Record<Locale, string> = { ko: 'ko', en: 'en', ja: 'ja', zh: 'zh-CN' }

const ko = {
  appTitle: 'AI 작업 사무실',
  connected: '연결됨',
  disconnected: '연결 안 됨',
  sessionsChip: (busy: number, waiting: number) =>
    waiting ? `세션 작업 중 ${busy} · 대기 ${waiting}` : `세션 작업 중 ${busy}`,
  zonesLimit: (n: number) => `사무실에는 ${n}개까지만 보입니다`,
  localOnly: '로컬 전용 · Claude Code + Codex 세션 기록 기준',
  language: '언어',
  projectSwitch: '프로젝트명',
  projectSwitchTitle: '구역 표식·상세 카드에 프로젝트 이름 보이기',
  fullscreen: '전체화면',
  exitFullscreen: '나가기',
  exitFullscreenTitle: '전체화면 나가기 (Esc)',
  close: '닫기 (Esc)',
  card: {
    type: '종류',
    state: '상태',
    tool: '도구',
    lastActivity: '마지막 활동',
    delegated: '맡긴 에이전트',
    session: '세션',
  },
  /** 연결 실패 안내. 가운데에 `npm run dev` 가 코드로 들어간다 */
  noStream: [
    '세션 기록 스트림에 연결하지 못했습니다. ',
    ' 로 띄운 서버에 접속했는지 확인해 주세요. 이 화면은 로컬 개발 서버에서만 동작합니다.',
  ] as [string, string],
  noSessions: '최근 30분 안에 작업한 Claude Code 또는 Codex 세션이 없습니다.',
  state: { working: '작업 중', waiting: '대기', idle: '졸음', ended: '퇴장', stalled: '응답 없음' },
  ago: (sec: number) =>
    sec < 60
      ? `${sec}초 전`
      : sec < 3600
        ? `${Math.floor(sec / 60)}분 ${sec % 60}초 전`
        : `${Math.floor(sec / 3600)}시간 ${Math.floor((sec % 3600) / 60)}분 전`,
  providerFilter: '서비스 선택',
  allProviders: '전체',
  noProviderSessions: '선택한 서비스의 활성 세션이 없습니다.',
  usageUnavailable: '사용량 기록 없음',
  usageRecorded: '기록 시각',
  usageWindow: (min: number) => min % 1440 === 0 ? `${min / 1440}일` : min % 60 === 0 ? `${min / 60}시간` : `${min}분`,
  usageTitle: '사용량',
  usageSession: '현재 세션',
  usageWeekly: '주간',
  resetsIn: (min: number) =>
    min < 60 ? `${min}분 뒤 초기화` : min < 1440 ? `${Math.floor(min / 60)}시간 ${min % 60}분 뒤 초기화` : `${Math.floor(min / 1440)}일 ${Math.floor((min % 1440) / 60)}시간 뒤 초기화`,
  mainName: '메인 에이전트',
  barista: '바리스타',
  subagent: '서브에이전트',
  waitingFor: (names: string) => `${names} 기다리는 중`,
  session: (id: string) => `세션 ${id}`,
}
export type Messages = typeof ko

const en: Messages = {
  appTitle: 'Agent Office',
  connected: 'Connected',
  disconnected: 'Disconnected',
  sessionsChip: (busy, waiting) =>
    waiting ? `Sessions working ${busy} · waiting ${waiting}` : `Sessions working ${busy}`,
  zonesLimit: (n) => `Only ${n} sessions fit in the office`,
  localOnly: 'Local only · Claude Code + Codex session logs',
  language: 'Language',
  projectSwitch: 'Project names',
  projectSwitchTitle: 'Show project names on zone labels and the detail card',
  fullscreen: 'Fullscreen',
  exitFullscreen: 'Exit',
  exitFullscreenTitle: 'Exit fullscreen (Esc)',
  close: 'Close (Esc)',
  card: {
    type: 'Type',
    state: 'State',
    tool: 'Tool',
    lastActivity: 'Last activity',
    delegated: 'Delegated agents',
    session: 'Session',
  },
  noStream: [
    'Could not connect to the session stream. Make sure this page is served by ',
    '. This page only works on the local dev server.',
  ],
  noSessions: 'No Claude Code or Codex sessions were active in the last 30 minutes.',
  state: { working: 'Working', waiting: 'Waiting', idle: 'Idle', ended: 'Left', stalled: 'Not responding' },
  ago: (sec) =>
    sec < 60
      ? `${sec}s ago`
      : sec < 3600
        ? `${Math.floor(sec / 60)}m ${sec % 60}s ago`
        : `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m ago`,
  providerFilter: 'Select service',
  allProviders: 'All',
  noProviderSessions: 'No active sessions for this service.',
  usageUnavailable: 'No usage record',
  usageRecorded: 'Recorded',
  usageWindow: (min) => min % 1440 === 0 ? `${min / 1440}d` : min % 60 === 0 ? `${min / 60}h` : `${min}m`,
  usageTitle: 'Usage',
  usageSession: 'Session',
  usageWeekly: 'Weekly',
  resetsIn: (min) =>
    min < 60 ? `Resets in ${min}m` : min < 1440 ? `Resets in ${Math.floor(min / 60)}h ${min % 60}m` : `Resets in ${Math.floor(min / 1440)}d ${Math.floor((min % 1440) / 60)}h`,
  mainName: 'Main agent',
  barista: 'Barista',
  subagent: 'Subagent',
  waitingFor: (names) => `Waiting for ${names}`,
  session: (id) => `Session ${id}`,
}

const ja: Messages = {
  appTitle: 'AIエージェントオフィス',
  connected: '接続中',
  disconnected: '未接続',
  sessionsChip: (busy, waiting) =>
    waiting ? `セッション 作業中 ${busy} · 待機 ${waiting}` : `セッション 作業中 ${busy}`,
  zonesLimit: (n) => `オフィスに表示できるのは ${n} 件までです`,
  localOnly: 'ローカル専用 · Claude Code + Codex のセッション記録',
  language: '言語',
  projectSwitch: 'プロジェクト名',
  projectSwitchTitle: 'ゾーン表示と詳細カードにプロジェクト名を表示',
  fullscreen: '全画面',
  exitFullscreen: '終了',
  exitFullscreenTitle: '全画面を終了 (Esc)',
  close: '閉じる (Esc)',
  card: {
    type: '種類',
    state: '状態',
    tool: 'ツール',
    lastActivity: '最終アクティビティ',
    delegated: '任せたエージェント',
    session: 'セッション',
  },
  noStream: [
    'セッション記録のストリームに接続できませんでした。',
    ' で起動したサーバーに接続しているか確認してください。この画面はローカル開発サーバーでのみ動作します。',
  ],
  noSessions: '直近 30 分以内に作業した Claude Code または Codex のセッションはありません。',
  state: { working: '作業中', waiting: '待機', idle: '居眠り', ended: '退席', stalled: '応答なし' },
  ago: (sec) =>
    sec < 60
      ? `${sec}秒前`
      : sec < 3600
        ? `${Math.floor(sec / 60)}分${sec % 60}秒前`
        : `${Math.floor(sec / 3600)}時間${Math.floor((sec % 3600) / 60)}分前`,
  providerFilter: 'サービス選択',
  allProviders: 'すべて',
  noProviderSessions: '選択したサービスのアクティブなセッションはありません。',
  usageUnavailable: '使用量記録なし',
  usageRecorded: '記録時刻',
  usageWindow: (min) => min % 1440 === 0 ? `${min / 1440}日` : min % 60 === 0 ? `${min / 60}時間` : `${min}分`,
  usageTitle: '使用量',
  usageSession: '現在のセッション',
  usageWeekly: '週間',
  resetsIn: (min) =>
    min < 60 ? `${min}分後にリセット` : min < 1440 ? `${Math.floor(min / 60)}時間${min % 60}分後にリセット` : `${Math.floor(min / 1440)}日${Math.floor((min % 1440) / 60)}時間後にリセット`,
  mainName: 'メインエージェント',
  barista: 'バリスタ',
  subagent: 'サブエージェント',
  waitingFor: (names) => `${names} を待機中`,
  session: (id) => `セッション ${id}`,
}

const zh: Messages = {
  appTitle: 'AI 智能体办公室',
  connected: '已连接',
  disconnected: '未连接',
  sessionsChip: (busy, waiting) =>
    waiting ? `会话 工作中 ${busy} · 等待 ${waiting}` : `会话 工作中 ${busy}`,
  zonesLimit: (n) => `办公室最多只显示 ${n} 个会话`,
  localOnly: '仅限本地 · 基于 Claude Code + Codex 会话记录',
  language: '语言',
  projectSwitch: '项目名称',
  projectSwitchTitle: '在区域标签和详情卡片中显示项目名称',
  fullscreen: '全屏',
  exitFullscreen: '退出',
  exitFullscreenTitle: '退出全屏 (Esc)',
  close: '关闭 (Esc)',
  card: {
    type: '类型',
    state: '状态',
    tool: '工具',
    lastActivity: '最近活动',
    delegated: '委派的智能体',
    session: '会话',
  },
  noStream: [
    '无法连接会话记录流。请确认访问的是通过 ',
    ' 启动的服务器。此页面仅在本地开发服务器上运行。',
  ],
  noSessions: '最近 30 分钟内没有活动的 Claude Code 或 Codex 会话。',
  state: { working: '工作中', waiting: '等待', idle: '打盹', ended: '已离开', stalled: '无响应' },
  ago: (sec) =>
    sec < 60
      ? `${sec}秒前`
      : sec < 3600
        ? `${Math.floor(sec / 60)}分${sec % 60}秒前`
        : `${Math.floor(sec / 3600)}小时${Math.floor((sec % 3600) / 60)}分前`,
  providerFilter: '选择服务',
  allProviders: '全部',
  noProviderSessions: '所选服务没有活动会话。',
  usageUnavailable: '暂无用量记录',
  usageRecorded: '记录时间',
  usageWindow: (min) => min % 1440 === 0 ? `${min / 1440}天` : min % 60 === 0 ? `${min / 60}小时` : `${min}分钟`,
  usageTitle: '用量',
  usageSession: '当前会话',
  usageWeekly: '每周',
  resetsIn: (min) =>
    min < 60 ? `${min}分钟后重置` : min < 1440 ? `${Math.floor(min / 60)}小时${min % 60}分钟后重置` : `${Math.floor(min / 1440)}天${Math.floor((min % 1440) / 60)}小时后重置`,
  mainName: '主智能体',
  barista: '咖啡师',
  subagent: '子智能体',
  waitingFor: (names) => `正在等待 ${names}`,
  session: (id) => `会话 ${id}`,
}

export const MESSAGES: Record<Locale, Messages> = { ko, en, ja, zh }

let current: Locale = 'en'
/** 지금 언어의 사전. 3D 장면의 이름표·말풍선처럼 Vue 밖에서 그리는 문구가 쓴다 */
export const t = (): Messages => MESSAGES[current]
export const getLocale = () => current
export function setLocale(locale: Locale) {
  current = locale
}

export const isLocale = (v: unknown): v is Locale => LOCALES.includes(v as Locale)

/** 브라우저 언어 목록(navigator.languages)에서 지원하는 첫 언어. 없으면 영어 */
export function detectLocale(langs: readonly string[]): Locale {
  for (const lang of langs) {
    const base = lang.toLowerCase().split('-')[0]
    if (isLocale(base)) return base
  }
  return 'en'
}
