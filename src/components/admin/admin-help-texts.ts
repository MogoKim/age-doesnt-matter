/** 어드민 필드별 도움말 텍스트 */
export const HELP = {
  // 팝업 관리
  POPUP_PRIORITY: '숫자가 높을수록 먼저 노출됩니다. 같은 값은 최신순 정렬.',
  POPUP_HIDE_FOR_DAYS: '사용자가 닫기를 클릭하면 N일 동안 해당 팝업이 미노출됩니다.',
  POPUP_SHOW_ONCE_PER_DAY: '같은 사용자에게 하루에 한 번만 표시됩니다.',
  POPUP_TARGET: '팝업이 노출될 페이지를 선택합니다. CUSTOM 선택 시 경로를 직접 입력하세요.',
  POPUP_TARGET_PATHS: '쉼표로 구분합니다. 예: /community/stories, /jobs',
  POPUP_ACTIVE: '켜면 기간 내일 때 즉시 노출이 시작됩니다.',
  POPUP_TYPE: '바텀 시트: 하단 슬라이드, 전면: 전체 화면, 센터: 중앙 직사각형 팝업',

  // 배너 관리
  BANNER_PRIORITY: '숫자가 낮을수록 슬라이더에서 먼저 표시됩니다. 0이 가장 앞.',
  BANNER_ACTIVE: '켜면 기간 내일 때 즉시 배너가 노출됩니다.',

  // 광고 관리
  AD_CTR: '클릭률(CTR) = 클릭수 ÷ 노출수 × 100',
  AD_SLOT: '광고가 표시될 위치입니다. 사이트 내 미리 정의된 영역에 배치됩니다.',
  AD_HTML_CODE: '광고 네트워크에서 제공하는 HTML 코드를 붙여넣으세요. 스크립트 태그는 보안상 자동 제거됩니다.',

  // 게시판 설정
  BOARD_HOT_THRESHOLD: '좋아요+댓글 합산 점수가 이 값 이상이면 뜨는글(HOT)로 자동 승격됩니다.',
  BOARD_FAME_THRESHOLD: '뜨는글 중 이 점수 이상이면 명예의 전당으로 자동 승격됩니다.',
  BOARD_WRITE_PERMISSION: '이 등급 이상 회원만 해당 게시판에 글을 작성할 수 있습니다.',
  BOARD_CATEGORIES: '해당 게시판에서 사용할 글 분류 태그입니다.',

  // 회원 관리
  MEMBER_GRADE: '회원 등급을 변경합니다. 등급에 따라 게시판 접근 권한이 달라집니다.',
  MEMBER_SANCTION: '정지: 지정 기간 동안 활동 제한. 차단: 영구적으로 서비스 이용 불가.',
} as const
