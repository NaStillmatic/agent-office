/**
 * 사무실 설정. 바꾸고 싶은 값은 이 파일에만 둔다. 모든 표는 선택 사항이라 고치지 않아도 된다 —
 * 표에 없는 agentType 은 이름 규칙(agentLabel)과 자동 배정으로 이름·모델·옷 색·자리를 정하므로
 * 어떤 프로젝트의 서브에이전트든 그대로 보인다. 이 파일은 three 에 의존하지 않는다.
 */

/**
 * agentType 별 모델·옷 색을 고정하고 싶을 때만 적는다(`main` 은 메인 Claude). 모델은 assets.ts CHARACTER_NAMES 에서
 * `character-` 를 뺀 이름이다. 표에 없는 종류는 scene.ts 가 옷 색 후보(CLOTHES_COLORS)에서 종류끼리 겹치지 않게 자동으로
 * 고르고, 모델은 종류 이름으로 고른다. 이름표 점·테두리·발밑 링·구역 바닥은 옷이 아니라 세션(구역) 색이다.
 */
export const AGENT_LOOKS: Record<string, { model: string; color: string }> = {
  main: { model: 'male-a', color: '#ff9f1c' },
}

/**
 * agentType 별 선호 자리(구역 안 자리 번호: 0~2 뒷줄, 3~5 앞줄, 5 는 큰 책상). `main` 은 메인 Claude.
 * 표에 없는 종류는 SEAT_OTHER 를 먼저 보고, 그 자리가 차 있으면 빈자리 아무 곳에나 앉는다.
 */
export const SEAT_OF_TYPE: Record<string, number> = {
  main: 5,
}
export const SEAT_OTHER = 2

/**
 * 메인 Claude 가 늘 자기 자리에 앉아 있게 한다(답을 기다릴 때도 자리에서 '…' 말풍선을 띄운다).
 * false 면 사용자 차례가 1분 넘게 이어질 때 휴게실로 쉬러 가고, 오래 조용하면 사무실을 돌아다닌다.
 * 서브에이전트는 이 값과 상관없이 한가하면 돌아다닌다.
 */
export const MAIN_STAYS_SEATED = true

/**
 * 이름표에 보일 이름을 agentType 대신 따로 정하고 싶을 때만 적는다(예: `'general-purpose': '범용'`).
 * 비워 두면 agentLabel 규칙을 따른다.
 */
export const AGENT_NAMES: Record<string, string> = {}

/**
 * 소파 위 액자 그림(픽셀아트). 'seaside' 는 해 뜬 바다와 돛단배·모래사장, 'skyline' 은 세피아 노을 아래 벽돌 아파트 단지다.
 * null 이면 OFFICE_SIGN 글자를 건다.
 */
export const OFFICE_ART: 'seaside' | 'skyline' | null = 'seaside'

/** OFFICE_ART 가 null 일 때 액자에 거는 글자. 둘 다 비어 있으면 액자를 걸지 않는다 */
export const OFFICE_SIGN = 'AGENT OFFICE'
