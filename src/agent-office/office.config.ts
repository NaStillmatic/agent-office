/**
 * 사무실 설정. 바꾸고 싶은 값은 이 파일에만 둔다. 모든 표는 선택 사항이라 고치지 않아도 된다 —
 * 표에 없는 agentType 은 이름 규칙(agentLabel)과 자동 배정으로 이름·모델·옷 색·자리를 정하므로
 * 어떤 프로젝트의 서브에이전트든 그대로 보인다. 이 파일은 three 에 의존하지 않는다.
 */

/**
 * agentType 별 모델·옷 색을 고정하고 싶을 때만 적는다(`main` 은 메인 에이전트). 모델은 assets.ts CHARACTER_NAMES 에서
 * `character-` 를 뺀 이름이다. 표에 없는 종류는 scene.ts 가 옷 색 후보(CLOTHES_COLORS)에서 종류끼리 겹치지 않게 자동으로
 * 고르고, 모델은 종류 이름으로 고른다. 이름표 점·테두리·발밑 링·구역 바닥은 옷이 아니라 세션(구역) 색이다.
 */
/** cap: true = 평평한 챙 모자, glasses: true = 안경. 생략하면 둘 다 착용하지 않는다. */
/** 2D 고해상도 스프라이트(기본) 또는 이전 3D 모델을 선택한다. */
export const CHARACTER_RENDER_STYLE: 'sprite' | '3d' = 'sprite'

export const AGENT_LOOKS: Record<string, { model: string; color: string; cap?: boolean; glasses?: boolean }> = {
  main: { model: 'male-a', color: '#ff9f1c' },
}

/**
 * agentType 별 선호 자리(역할 구역 안 자리 번호: 0~2와 3~5가 마주 본다). 메인은 세션 슬롯에 해당하는 공용 자리를 따로 예약한다.
 * 표에 없는 종류는 SEAT_OTHER 를 먼저 보고, 그 자리가 차 있으면 빈자리 아무 곳에나 앉는다.
 */
export const SEAT_OF_TYPE: Record<string, number> = {}
export const SEAT_OTHER = 3

/**
 * 메인 에이전트가 늘 자기 자리에 앉아 있게 한다(답을 기다릴 때도 자리에서 '…' 말풍선을 띄운다).
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
 * 독립형 액자 그림(픽셀아트). 'seaside' 는 해 뜬 바다와 돛단배·모래사장, 'skyline' 은 세피아 노을 아래 도심 풍경이다.
 * null 이면 OFFICE_SIGN 글자를 건다.
 */
export const OFFICE_ART: 'seaside' | 'skyline' | null = 'skyline'

/** OFFICE_ART 가 null 일 때 독립형 액자에 거는 글자. 둘 다 비어 있으면 액자를 걸지 않는다 */
export const OFFICE_SIGN = 'AGENT OFFICE'
