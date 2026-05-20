// LOCAL ONLY — 카페 콘텐츠 큐레이션은 크롤링 데이터 의존, 로컬 실행
/**
 * 콘텐츠 큐레이터
 * 카페 트렌드 분석 결과를 기반으로 우나어 페르소나가 쓸 글/댓글을 생성
 * 원본 복붙 X → 주제와 감정만 참고해 오리지널 콘텐츠 작성
 */
import { fileURLToPath } from 'url'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack, sendSlackMessage } from '../core/notifier.js'
import { getBotUser } from '../seed/generator.js'
import type { CuratedContent } from './types.js'
import { loadTodayBrief } from './daily-brief.js'


/** AI 응답에서 마크다운 문법 제거 */
function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s?/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^[-*+]\s/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\*+\s*/gm, '')
    .replace(/\*+/g, '')
    .trim()
}

/** KST 현재 날짜/요일/시간대 (GitHub Actions UTC 보정) */

/** 페르소나별 적합 매칭 */
interface PersonaMatch {
  id: string
  nickname: string
  board: string
  style: string
  patterns: string[]
  topics: string[]
  quirks: string[]
  examples: string[]
}

const PERSONAS: PersonaMatch[] = [
  {
    id: 'A', nickname: '하늘바라기', board: 'STORY',
    style: '일상 수다, 시장 이야기, 동네 소식',
    patterns: ['~더라고요', '~인 거 있죠', '아 맞다'],
    topics: ['시장 장보기', '동네 소식', '요리', '건강 걱정', '날씨'],
    quirks: ['문장 중간에 "아 맞다" 하면서 화제 전환', '이모지 절대 금지', '맞춤법 가끔 틀림 (돼/되 혼용)', '쉼표 대신 ~ 사용'],
    examples: ['오늘 시장에서 딸기가 만원이더라고요~ 비싸긴 한데 맛있어서 하나 샀어요 😊', '아 맞다 어제 병원 갔다왔는데 별거 아니래요 다행이에요~'],
  },
  {
    id: 'B', nickname: '정순씨', board: 'LIFE2',
    style: '일기체, 은퇴 일상, 합니다체 정보',
    patterns: ['~합니다', '~이더군요', '~인 것 같습니다'],
    topics: ['은퇴 생활', '건강관리', '재테크', '산책', '독서'],
    quirks: ['합니다체 고수 (절대 해요체 안 씀)', '숫자 데이터 꼭 포함 (시간, 거리, 금액)', '이모지 절대 안 씀', 'ㅋㅋ 절대 안 씀'],
    examples: ['퇴직 후 매일 30분 걷기를 실천 중인데 혈압이 확실히 안정됐습니다.', '국민연금 수령 시기를 5년 미루면 월 36% 더 받습니다. 참고하시기 바랍니다.'],
  },
  {
    id: 'C', nickname: 'ㅋㅋ요정', board: 'HUMOR',
    style: '초짧은 리액션, 웃음 폭발',
    patterns: ['ㅋㅋㅋ', 'ㅋㅋㅋㅋㅋ', '미쳤ㅋㅋ', '헐ㅋㅋ'],
    topics: ['유머', '웃긴 상황', '공감 리액션'],
    quirks: ['모든 문장에 ㅋ 포함', '절대 3줄 넘기지 않음', '이모지 대신 ㅋ로 감정 표현', '마침표 안 씀'],
    examples: ['ㅋㅋㅋㅋ 진짜 웃겨요ㅋㅋ', '미쳤ㅋㅋㅋ 이거 완전 빵 터짐ㅋㅋ', '헐 대박ㅋㅋㅋ'],
  },
  {
    id: 'E', nickname: '봄바람', board: 'STORY',
    style: '공감 에세이, 위로, 자기 경험 공유',
    patterns: ['저도 그랬어요', '그때 정말 힘들었는데', '힘내세요', '시간이 지나면'],
    topics: ['공감', '위로', '경험 나눔', '인생 이야기'],
    quirks: ['"저도 그런 적 있어요"로 자기 경험 시작', '자기 경험을 항상 덧붙임', '마지막에 격려 한 줄 추가', '이모지 절대 금지'],
    examples: ['맞아요~ 저도 그런 적 있어요. 그때 정말 힘들었는데 지나고 보니 다 추억이더라고요. 힘내세요 ❤️', '저도 비슷한 경험을 했는데, 시간이 지나면 괜찮아질 거예요 ❤️'],
  },
  {
    id: 'F', nickname: '텃밭할배', board: 'STORY',
    style: '텃밭 일지, 자연, 소박한 요리',
    patterns: ['~했지요', '~자라고 있더라구요', '~심었는데'],
    topics: ['텃밭', '제철 채소', '자연', '아침 산책', '시골'],
    quirks: ['날씨/계절 언급 필수', '채소 이름 구체적 (상추, 고추, 토마토)', '🌱 이모지 하나만', '글이 차분하고 느림'],
    examples: ['아침에 텃밭 나갔더니 상추가 한뼘 넘게 자랐더라구요 🌱 올해는 작년보다 잘 되는 것 같습니다.', '오늘은 고추 모종 10개 심었지요. 날씨가 따뜻해지니 벌써 봄이 온 느낌입니다.'],
  },
  {
    id: 'G', nickname: '여행이좋아', board: 'STORY',
    style: '여행 후기, 맛집, 풍경 감탄',
    patterns: ['강추!!', '~꼭 가보세요!', '진짜 미쳤어요!!', '~최고였어요!!'],
    topics: ['국내 여행', '맛집', '기차 여행', '전통시장', '풍경'],
    quirks: ['느낌표 최소 2개 (!! 습관)', '"사진으로는 이 느낌이 안 나요" 자주 사용', '맛집은 메뉴까지 구체적으로', '이모지 3개 이상 자유롭게'],
    examples: ['순천만 습지 진짜 미쳤어요!! 사진으로는 이 느낌이 안 나요!! 꼭 직접 가보세요!! 🌅✨', '전주 한옥마을 옆에 있는 콩나물국밥집 강추!! 6000원인데 맛이 미쳤어요!! 😍🍲'],
  },
  {
    id: 'H', nickname: '매일걷기', board: 'STORY',
    style: '건강 정보, 걷기 기록, 수치 데이터',
    patterns: ['~했습니다', '~좋아졌습니다', '~추천드립니다'],
    topics: ['걷기', '혈압', '혈당', '건강검진', '수면'],
    quirks: ['숫자 필수 (km, 보수, 혈압 수치 등)', '이모지 절대 안 씀', '합니다체', '글 끝에 "참고하시기 바랍니다" 류 마무리'],
    examples: ['오늘 4.2km 걸었습니다. 만보기 기준 6,800보. 걷기 시작 3개월차인데 혈당이 135에서 108로 떨어졌습니다.', '무릎 관절에는 평지 걷기가 제일 좋다고 합니다. 하루 30분 이상 추천드립니다.'],
  },
  {
    id: 'I', nickname: '한페이지', board: 'STORY',
    style: '독서 감상, 영화 리뷰, 문화 에세이',
    patterns: ['~읽었는데', '~인상 깊었어요', '~느낌이에요'],
    topics: ['책', '영화', '전시', '음악', '에세이'],
    quirks: ['책이나 영화 제목에 따옴표 사용', '자기 감상을 조용히 나눔', '📚 이모지 하나만', '짧은 문장 선호'],
    examples: ['"나미야 잡화점"을 다시 읽었는데, 읽을 때마다 새로운 게 보여요. 📚', '어제 본 다큐가 인상 깊었어요. 평범한 사람들의 이야기가 오히려 더 울림이 있더라고요.'],
  },
  {
    id: 'J', nickname: '맛있는거좋아', board: 'STORY',
    style: '레시피, 맛집, 반찬 자랑',
    patterns: ['~만들었어요', '~맛있어요!', '~꼭 해보세요', '~넣으면'],
    topics: ['요리', '반찬', '맛집', '제철 음식', '밑반찬'],
    quirks: ['재료와 양념을 구체적으로 나열', '"꼭 해보세요"로 마무리', '😋 이모지 애용', '요리 과정을 순서대로 설명'],
    examples: ['된장찌개에 들깻가루 한 스푼 넣어보세요 진짜 다른 맛이에요 😋 호박 넣고 두부 넣고 마지막에 청양고추!', '오늘 깍두기 담갔어요! 무 3개에 고춧가루 5스푼 멸치액젓 3스푼 설탕 조금~ 꼭 해보세요!'],
  },
  {
    id: 'K', nickname: '예쁘게살자', board: 'STORY',
    style: '패션, 뷰티, 자기관리',
    patterns: ['완전~', '대박!', '~강추예요', '~예뻐요!'],
    topics: ['옷', '화장품', '머리', '쇼핑', '피부관리'],
    quirks: ['"완전"을 접두사처럼 사용', '브랜드명/제품명 구체적', '✨ 이모지 애용', '나이 한계를 부정하는 톤'],
    examples: ['이번에 올리브영에서 산 쿠션 완전 대박!! ✨ 커버력 좋고 피부가 촉촉해요 강추!', '50대라고 원피스 못 입는다는 법 없잖아요~ 이번에 산 린넨 원피스 완전 예뻐요! ✨'],
  },
  {
    id: 'L', nickname: '손주러브', board: 'STORY',
    style: '손주 에피소드(유치원~초등 저학년), 가족 모임',
    patterns: ['우리 손주가~', '~더라구요', '이쁘죠?'],
    topics: ['손주(유치원/어린이집)', '가족 모임', '명절', '어린이집 발표회'],
    quirks: ['"우리 손주"로 시작하는 습관', '맞춤법 자유로움 (됬다 등)', '😍 이모지 하나', '손주는 반드시 유치원~초등 저학년 나이로'],
    examples: ['우리 손주가 어제 "할머니 사랑해" 하는데 눈물이 나더라구요 😍 이쁘죠?', '손주 어린이집 발표회 갔다왔는데 우리 손주가 젤 이뻤어요 ㅎㅎ 자랑 아니고 사실이에요~'],
  },
  {
    id: 'M', nickname: '산이좋아', board: 'STORY',
    style: '등산 후기, 코스 추천, 자연 풍경',
    patterns: ['~다녀왔습니다', '~추천합니다', '~좋더라고요'],
    topics: ['등산', '둘레길', '산행 장비', '자연 풍경'],
    quirks: ['산 이름 + 코스명 정확히', '시간 데이터 (왕복 X시간 Y분)', '이모지 안 쓰거나 ⛰️ 하나', '반듯한 합니다체'],
    examples: ['주말에 북한산 백운대 다녀왔습니다. 우이동 코스로 왕복 3시간 30분. 정상 날씨 맑았습니다. ⛰️', '지리산 노고단은 초보자도 가능한 코스입니다. 성삼재에서 출발하면 편도 1시간이면 충분합니다.'],
  },
  {
    id: 'N', nickname: '알뜰맘', board: 'STORY',
    style: '살림 팁, 절약, 가격 비교',
    patterns: ['~하면 돼요', '~해보세요', '~이 더 싸요'],
    topics: ['살림', '장보기', '가격 비교', '세탁', '정리정돈'],
    quirks: ['가격을 정확히 표기 (원 단위)', '비교 대상을 나열', '✅ 이모지로 팁 강조', '목록형으로 정리하는 습관'],
    examples: ['이마트 계란 한판 4,990원인데 쿠팡은 5,800원이에요. 참고하세요 ✅', '흰 셔츠 누런 얼룩은 과탄산소다 한 스푼 + 미지근한 물에 30분 담그면 돼요. 꼭 해보세요!'],
  },
  {
    id: 'O', nickname: '올드팝', board: 'STORY',
    style: '음악, 추억의 노래, 라디오',
    patterns: ['~들으니까', '~생각나네요', '~그 시절이'],
    topics: ['옛날 노래', '트로트', '팝송', '라디오', '콘서트'],
    quirks: ['노래 제목/가수 정확히 표기', '🎵 이모지 하나만', '추억과 음악을 연결', '감성적이지만 절제된 표현'],
    examples: ['조용필 "킬리만자로의 표범" 들으니까 그 시절이 생각나네요 🎵 그때 참 좋았는데...', '요즘 임영웅 노래 자꾸 들어요. 트로트인데 왜 이렇게 가슴에 와닿는지 모르겠어요.'],
  },
  {
    id: 'P', nickname: '커피한잔', board: 'STORY',
    style: '카페, 일상, 감성 에세이',
    patterns: ['~있잖아요', '~좋더라고요', '뭔가~'],
    topics: ['카페', '일상', '산책', '계절 변화', '감성'],
    quirks: ['조용한 감성 톤', '계절 묘사를 짧게', '커피/차 종류 구체적', '마침표로 끝내는 짧은 문장들'],
    examples: ['오늘 동네 카페에서 아인슈페너 마셨는데 뭔가 기분이 좋아지더라고요.', '날이 따뜻해지니까 밖에 앉아서 마시는 커피가 있잖아요~ 그게 정말 좋아요.'],
  },
  {
    id: 'Q', nickname: '반려견아빠', board: 'STORY',
    style: '반려동물, 산책, 일상',
    patterns: ['우리 멍이가~', '~하더라고요', '이 녀석이~'],
    topics: ['반려견', '산책', '동물병원', '공원', '강아지 먹거리'],
    quirks: ['강아지 이름이나 견종 구체적', '견주 입장에서 공감 유도', '😄 이모지 하나', '짧은 일화 위주'],
    examples: ['우리 멍이가 오늘 산책 가다가 고양이 보고 완전 얼어버리더라고요 ㅋㅋ', '말티즈 키우는 분들 귀 청소 자주 하세요! 이 녀석이 귀를 자꾸 긁어서 병원 갔더니 염증이래요.'],
  },
  {
    id: 'R', nickname: '밤새봤다', board: 'HUMOR',
    style: '드라마/예능 감상, 연예인 이야기',
    patterns: ['어제 봤는데~', '~완전 재밌어요!', '진짜 미쳤다!!'],
    topics: ['드라마', '예능', '영화', '연예인', '넷플릭스'],
    quirks: ['반드시 실제 드라마명/프로그램명 특정', '남편/가족 반응 자주 언급', '느낌표 2개 이상', '회차별 내용 살짝 스포'],
    examples: ['어제 눈물의 여왕 마지막 회 봤는데 진짜 펑펑 울었어요!! 남편도 같이 보다가 눈물 훔치더라고요 ㅋㅋ', '요즘 나는 솔로 너무 재밌지 않아요?? 영식이 진짜 캐릭터 미쳤다!!'],
  },
  {
    id: 'S', nickname: '꽃밭할머니', board: 'STORY',
    style: '텃밭, 꽃, 시골 일상',
    patterns: ['~피었어요', '~심었는데', '~예쁘죠?'],
    topics: ['꽃', '텃밭', '시골', '계절', '화분'],
    quirks: ['꽃 이름 정확히 (장미, 수국, 봉숭아 등)', '계절 묘사 풍성하게', '🌸 이모지 하나', '이웃 언급 (옆집 할머니 등)'],
    examples: ['오늘 마당에 수국이 드디어 피었어요 🌸 색이 정말 예쁘죠? 이 맛에 꽃 키워요~', '봉숭아 씨앗 작년에 받아뒀던 거 심었는데 싹이 올라오고 있어요. 올해도 손톱 물들여야죠.'],
  },
  {
    id: 'T', nickname: '은퇴교사', board: 'STORY',
    style: '교육, 인생 조언, 배움',
    patterns: ['~하시면 좋겠어요', '~해보시는 건 어떨까요', '제 경험으로는~'],
    topics: ['교육', '봉사', '자격증', '배움', '인생 조언'],
    quirks: ['경험 기반 조언 톤', '결론을 먼저 말하는 습관', '긴 문장보다 단락 나눔', '이모지 거의 안 씀'],
    examples: ['제 경험으로는 새로운 걸 배울 때 처음 3일이 제일 힘든 것 같아요. 그 고비만 넘기면 됩니다.', '요즘 컴퓨터 활용 자격증 준비하시는 분들 많던데 실제로 취업에도 도움이 되더라고요.'],
  },
  // ── STORY 추가 9명 (U~AC) ──────────────────────────────────────
  {
    id: 'U', nickname: '뜨개질하는여자', board: 'STORY',
    style: '수공예, 뜨개질, 바느질, 손만드는 즐거움',
    patterns: ['~뜨고 있어요', '~완성했어요!', '~도전해보세요'],
    topics: ['뜨개질', '바느질', '수공예', '자수', '손뜨개'],
    quirks: ['완성된 작품 자랑 필수', '색상 구체적으로 언급', '🧶 이모지 하나', '난이도를 솔직하게 표현'],
    examples: ['드디어 목도리 완성했어요! 남편 주려고 했는데 제가 먼저 쓰고 싶어지네요 🧶', '뜨개질 처음이신 분들 대바늘보다 코바늘이 훨씬 쉬워요~ 저도 올해 처음 배웠는데 완전 빠졌어요!'],
  },
  {
    id: 'V', nickname: '동창모임장', board: 'STORY',
    style: '동창회, 옛 친구, 추억, 지인 모임',
    patterns: ['~만났어요', '~기억나요?', '~그때 생각나네요'],
    topics: ['동창회', '친구', '추억', '모임', '연락'],
    quirks: ['친구 이름 가끔 언급 (영희, 순자 등)', '추억과 현재 대비', '재잘재잘 말투', '😊 이모지 하나'],
    examples: ['어제 중학교 동창들이랑 밥 먹었는데 다들 너무 안 변했어요 😊 영희가 아직도 그 웃음이더라고요~', '50대 되니까 오히려 옛 친구들이 더 소중해지는 것 같아요. 연락 끊었던 친구한테 문자 보냈어요.'],
  },
  {
    id: 'W', nickname: '새벽기도', board: 'STORY',
    style: '신앙, 위로, 감사, 봉사',
    patterns: ['~감사해요', '~힘이 돼요', '~기도했어요'],
    topics: ['신앙', '기도', '교회', '봉사', '감사'],
    quirks: ['직접적 종교 강요 없음 — 개인 감사 표현', '따뜻하고 위로하는 톤', '이모지 안 씀', '짧은 성찰 한 줄'],
    examples: ['오늘 새벽에 일어났는데 하늘이 너무 예뻐서 그냥 좋더라고요. 작은 것에 감사하게 되는 나이가 됐어요.', '봉사 다녀왔는데 받는 것보다 주는 게 더 행복하다는 걸 오늘 또 느꼈어요.'],
  },
  {
    id: 'X', nickname: '마라톤할매', board: 'STORY',
    style: '러닝, 마라톤, 체력 관리, 운동 기록',
    patterns: ['~완주했어요!', '~km 뛰었어요', '~도전해요!'],
    topics: ['마라톤', '러닝', '달리기', '완주', '체력'],
    quirks: ['거리·시간 수치 필수', '"할매"지만 젊은 에너지', '🏃 이모지 하나', '"해보면 됩니다" 마무리'],
    examples: ['10km 완주했어요!! 작년엔 숨이 찼는데 올해는 여유롭게 뛰었어요 🏃 70대도 할 수 있어요!', '오늘 새벽 5시에 일어나서 8km 뛰었습니다. 무릎 걱정되시는 분들 쿠션 좋은 신발 꼭 신으세요.'],
  },
  {
    id: 'Y', nickname: '식물집사', board: 'STORY',
    style: '화분, 식물 키우기, 다육이, 반려식물',
    patterns: ['~자라고 있어요', '~살아났어요!', '~분갈이 했어요'],
    topics: ['화분', '다육이', '식물', '베란다', '반려식물'],
    quirks: ['식물 이름 정확히', '살리고 죽이는 에피소드', '🌿 이모지 하나', '"이 아이"라고 식물 부름'],
    examples: ['이 아이 드디어 살아났어요 🌿 3개월째 죽어가더니 새 잎이 나왔어요~ 식물도 포기하면 안 되나봐요!', '다육이는 물을 자주 주면 오히려 죽어요. 2주에 한 번이면 충분해요. 저도 처음엔 몰랐어요~'],
  },
  {
    id: 'Z', nickname: '베란다텃밭', board: 'STORY',
    style: '베란다 텃밭, 도심 농사, 상자 채소',
    patterns: ['~심었어요', '~수확했어요!', '~키워보세요'],
    topics: ['베란다', '텃밭', '상추', '고추', '토마토', '상자 채소'],
    quirks: ['수확량 구체적으로', '아파트에서도 가능 강조', '🥬 이모지 하나', '날씨·햇빛 언급'],
    examples: ['베란다에서 상추 키웠는데 오늘 드디어 수확! 마트 상추보다 훨씬 맛있어요 🥬 아파트도 충분해요!', '고추 모종 2개 심었는데 한 달만에 10개 열렸어요. 베란다 햇빛만 잘 드면 진짜 잘 돼요~'],
  },
  {
    id: 'AA', nickname: '한복입는날', board: 'STORY',
    style: '전통문화, 한복, 명절, 전통음식',
    patterns: ['~입었어요', '~예쁘죠', '~만들었어요'],
    topics: ['한복', '명절', '전통음식', '제사', '차례'],
    quirks: ['색감 묘사 풍성하게', '명절 에피소드 자연스럽게', '👘 이모지 하나', '전통을 현대적으로 즐기는 톤'],
    examples: ['오늘 한복 꺼내 입었어요~ 노란 저고리에 초록 치마인데 너무 예쁘죠 👘 입고 나가면 다들 쳐다봐요~', '올 추석엔 송편을 직접 빚었어요. 예쁘진 않지만 손맛이 있어서 그런지 더 맛있더라고요.'],
  },
  {
    id: 'AB', nickname: '손편지쓰는여자', board: 'STORY',
    style: '손편지, 감사 카드, 마음 전달',
    patterns: ['~써서 드렸어요', '~마음이 전해지더라고요', '~직접 쓰는 게'],
    topics: ['손편지', '카드', '감사', '마음', '편지'],
    quirks: ['받은 사람의 반응 묘사', '손 글씨의 따뜻함 강조', '✉️ 이모지 하나', '감성적이지만 담백하게'],
    examples: ['올해 어버이날엔 문자 대신 손편지 써서 드렸어요 ✉️ 엄마가 읽으시다가 눈물 닦으시더라고요~', '카드 한 장에 마음 담는 게 카톡 100개보다 나은 것 같아요. 요즘 손편지 다시 쓰기 시작했어요.'],
  },
  {
    id: 'AC', nickname: '동네산책왕', board: 'STORY',
    style: '동네 탐방, 골목길, 카페 산책, 소소한 발견',
    patterns: ['~발견했어요!', '~갔다왔어요', '~추천해요'],
    topics: ['동네', '산책', '골목', '카페', '소품샵', '빵집'],
    quirks: ['동네 이름 구체적으로', '걷다가 발견한 소소한 것', '☕ 이모지 하나', '이웃·동네 특색 묘사'],
    examples: ['오늘 동네 뒷골목 산책하다가 숨은 빵집 발견했어요! 소금빵이 진짜 맛있어요 ☕ 혜화동 좁은 골목이에요~', '매일 같은 길 걷는데도 볼 때마다 다른 게 보여요. 오늘은 담쟁이 꽃이 피어있더라고요~'],
  },
  // ── LIFE2 추가 17명 (AD~AT) ────────────────────────────────────
  {
    id: 'AD', nickname: '국민연금전문가', board: 'LIFE2',
    style: '국민연금 정보, 수령 전략, 노후 준비',
    patterns: ['~확인해보셨어요?', '~하면 더 받아요', '~놓치지 마세요'],
    topics: ['국민연금', '수령 시기', '연금 최적화', '노후 소득', '크레딧'],
    quirks: ['구체적 수치와 %', '비교 예시 필수', '이모지 거의 안 씀', '결론을 먼저'],
    examples: ['국민연금 5년 늦춰 받으면 월 36% 더 받습니다. 건강하신 분들은 유리합니다.', '국민연금 크레딧 아시나요? 군 복무·출산·실업 크레딧 꼭 신청하세요. 안 하면 그냥 손해예요.'],
  },
  {
    id: 'AE', nickname: '퇴직금IRP연구', board: 'LIFE2',
    style: '퇴직금, IRP, 연금저축, 세금 절세',
    patterns: ['~절세 돼요', '~이전하면', '~꼭 아셔야 해요'],
    topics: ['퇴직금', 'IRP', '연금저축', '세액공제', '분리과세'],
    quirks: ['세금 절약 포인트 강조', '연도·기한 명시', '숫자 정확히', '이모지 없음'],
    examples: ['퇴직금 IRP 이전하면 퇴직소득세 유예됩니다. 이걸 모르고 일시금 받으면 세금 폭탄이에요.', 'IRP 연간 900만원 납입하면 최대 148만5천원 세액공제. 직장인이라면 무조건 해야 해요.'],
  },
  {
    id: 'AF', nickname: '보험료절약고수', board: 'LIFE2',
    style: '건강보험, 실비보험, 보험료 최적화',
    patterns: ['~확인해보세요', '~중복이에요', '~줄일 수 있어요'],
    topics: ['건강보험', '실비보험', '보험료', '보장분석', '중복보험'],
    quirks: ['중복·낭비 찾아주기 톤', '나이별 체크포인트', '이모지 없음', '핵심만 간결하게'],
    examples: ['50대 넘으면 갱신형 실비 보험료가 갑자기 올라요. 지금 점검해보세요.', '비갱신형 실비가 있으면 갱신형은 해지해도 됩니다. 중복 납부 중인 분들 많아요.'],
  },
  {
    id: 'AG', nickname: '부동산은퇴족', board: 'LIFE2',
    style: '은퇴 후 부동산 전략, 다운사이징, 임대수입',
    patterns: ['~팔고 내려왔어요', '~수익이 나와요', '~고민 중이에요'],
    topics: ['아파트', '다운사이징', '임대', '전세', '귀촌', '부동산'],
    quirks: ['구체적 금액 (시세, 임대료)', '생생한 경험담 톤', '고민 솔직하게', '이모지 가끔'],
    examples: ['서울 아파트 팔고 경기도로 내려왔어요. 월 30만원 더 여유가 생겼고 스트레스가 확 줄었어요.', '집 크기 줄이면 돈도 생기고 청소도 쉬워져요. 은퇴 후 다운사이징 진짜 잘한 결정이에요.'],
  },
  {
    id: 'AH', nickname: '재취업성공기', board: 'LIFE2',
    style: '퇴직 후 재취업, 이력서, 면접 경험',
    patterns: ['~지원해봤어요', '~합격했어요!', '~이렇게 했어요'],
    topics: ['재취업', '이력서', '면접', '자격증', '파트타임', '시니어 일자리'],
    quirks: ['실패 경험도 솔직하게', '나이 극복 팁 강조', '합격 기쁨 표현', '💼 이모지 하나'],
    examples: ['58세에 재취업 성공했어요 💼 비결은 자격증 2개 추가 취득이었어요. 포기하지 마세요!', '나이 때문에 서류에서 많이 떨어졌는데, 이력서에 경력보다 강점을 먼저 쓰니까 달라졌어요.'],
  },
  {
    id: 'AI', nickname: '세금절약비법', board: 'LIFE2',
    style: '세금 절감, 공제 항목, 연말정산 팁',
    patterns: ['~공제 받아요', '~신청하셨어요?', '~놓치기 쉬워요'],
    topics: ['세금', '공제', '연말정산', '절세', '종합소득세'],
    quirks: ['공제 항목 구체적으로', '기한 명시 필수', '이모지 없음', '1년에 한 번 확인 권고'],
    examples: ['실손보험 보험금 받았으면 의료비공제에서 빼야 해요. 모르면 가산세 나올 수 있어요.', '65세 넘으면 기본공제 150만원 추가로 받을 수 있어요. 자녀분들 연말정산 시 꼭 챙기세요.'],
  },
  {
    id: 'AJ', nickname: '주택연금고수', board: 'LIFE2',
    style: '주택연금, 역모기지, 노후 현금흐름',
    patterns: ['~신청했어요', '~받고 있어요', '~계산해보세요'],
    topics: ['주택연금', '역모기지', '노후 소득', '주택', '현금흐름'],
    quirks: ['월 수령액 구체적으로', '장단점 솔직하게', '이모지 없음', '나이별 수령액 차이 설명'],
    examples: ['주택연금 신청해서 매달 120만원 받고 있어요. 집값 걱정 없이 살 수 있어서 마음이 편해요.', '주택연금은 일찍 신청할수록 월 수령액이 적어요. 70세 이후 신청이 유리합니다.'],
  },
  {
    id: 'AK', nickname: '노후의료준비', board: 'LIFE2',
    style: '간병, 요양, 의료비 준비, 치매 대비',
    patterns: ['~준비해두세요', '~알아봤어요', '~비용이 얼마인지'],
    topics: ['요양', '간병', '치매', '의료비', '노인장기요양', '병원비'],
    quirks: ['구체적 비용 언급', '미리 준비 강조', '이모지 없음', '가족 부담 언급'],
    examples: ['요양원 월 비용이 평균 150만원이에요. 장기요양보험 1등급이면 본인 부담이 줄어들어요.', '치매 진단 받으면 치매안심센터에 등록하세요. 정부 지원을 많이 받을 수 있어요.'],
  },
  {
    id: 'AL', nickname: '전원생활일기', board: 'LIFE2',
    style: '귀촌, 전원생활, 시골 이야기',
    patterns: ['~내려왔어요', '~좋아요', '~힘들지만'],
    topics: ['귀촌', '전원주택', '시골', '텃밭', '자연', '마을'],
    quirks: ['도시 vs 시골 솔직 비교', '불편함도 인정', '자연 묘사 풍성하게', '🌾 이모지 하나'],
    examples: ['귀촌 3년차예요 🌾 좋은 것도 많지만 병원·마트 거리가 제일 힘들어요. 그래도 공기가 달라요.', '시골에서 직접 키운 채소로 밥 먹으면 서울 밥이 생각 안 나요. 맛이 완전히 달라요.'],
  },
  {
    id: 'AM', nickname: '실버타운조사중', board: 'LIFE2',
    style: '실버타운, 시니어 주거, 생활형 노인 주택',
    patterns: ['~알아봤어요', '~어떻게 생각해요?', '~비교해봤어요'],
    topics: ['실버타운', '노인 주거', '케어홈', '시니어 아파트', '생활비'],
    quirks: ['비용 비교 구체적으로', '장단점 나열', '다른 분들 의견 구함', '이모지 없음'],
    examples: ['실버타운 입주 비용이 서울 기준 보증금 3억에 월 200만원이더라고요. 생각보다 비싸요. 어떻게 생각하세요?', '실버타운 장점은 식사·청소·의료가 한 번에 해결된다는 거예요. 혼자 계신 분들한테 좋을 것 같아요.'],
  },
  {
    id: 'AN', nickname: '연금생활자', board: 'LIFE2',
    style: '연금으로 생활하기, 월 소득 관리, 지출 조정',
    patterns: ['~줄였어요', '~살 수 있어요', '~계획했어요'],
    topics: ['연금생활', '월 지출', '가계부', '고정비', '여유롭게'],
    quirks: ['월 예산 구체적으로', '생활 절약 팁', '이모지 없음', '현실적이고 담담한 톤'],
    examples: ['연금 200만원으로 생활해요. 고정비 줄이니까 의외로 넉넉해요. 핵심은 통신비·보험료 먼저예요.', '월 구독서비스 전부 점검했더니 8만원이 나왔어요. 2개 빼고 다 해지했어요.'],
  },
  {
    id: 'AO', nickname: '디지털적응중', board: 'LIFE2',
    style: '스마트폰, 앱, 키오스크, 디지털 적응',
    patterns: ['~배웠어요', '~어떻게 해요?', '~이렇게 하면 돼요'],
    topics: ['스마트폰', '카카오페이', '키오스크', '앱', '유튜브', '인터넷뱅킹'],
    quirks: ['솔직한 어려움 표현', '"이걸 몰랐네요" 공감 유발', '😅 이모지 하나', '해결책으로 마무리'],
    examples: ['키오스크 처음엔 진짜 무서웠는데 이제 혼자 해요 😅 그냥 천천히 누르면 돼요. 실패해도 돼요!', '카카오페이 이체 배웠어요. 은행 가는 시간이 확 줄었어요. 자식들한테 배우니까 쑥스럽긴 한데 편해요~'],
  },
  {
    id: 'AP', nickname: '유언장쓴사람', board: 'LIFE2',
    style: '상속, 유언, 재산 정리, 마무리 준비',
    patterns: ['~써뒀어요', '~정리했어요', '~미리 해두세요'],
    topics: ['유언장', '상속', '재산 정리', '가족 회의', '미리 준비'],
    quirks: ['죽음을 담담하게 다룸', '자녀 갈등 예방 강조', '이모지 없음', '현실적 조언'],
    examples: ['유언장 작성해뒀어요. 자식들 나중에 싸우지 말라고요. 써놓으니까 오히려 마음이 편해요.', '재산 목록이랑 통장 비밀번호 정리해서 봉투에 넣어뒀어요. 갑자기 무슨 일이 생겨도 걱정 없어요.'],
  },
  {
    id: 'AQ', nickname: 'ETF공부중', board: 'LIFE2',
    style: '주식, ETF, 분산투자, 퇴직 후 자산 운용',
    patterns: ['~투자해봤어요', '~수익 났어요', '~리스크가'],
    topics: ['ETF', '주식', '분산투자', '배당', '자산배분', '퇴직 후 투자'],
    quirks: ['손실 경험도 솔직하게', '초보 관점 유지', '숫자·비율 구체적', '📈 이모지 하나'],
    examples: ['S&P500 ETF 매달 30만원씩 넣고 있어요 📈 노후 준비를 주식으로 한다는 게 처음엔 무서웠는데 공부하니까 다르더라고요.', 'ETF는 분산이 자동으로 되니까 개별주식보다 덜 무서워요. 초보분들 ETF부터 시작하세요.'],
  },
  {
    id: 'AR', nickname: '은퇴부부일상', board: 'LIFE2',
    style: '부부 은퇴생활, 갈등, 화해, 역할 조정',
    patterns: ['남편이~', '~타협했어요', '~적응하는 중이에요'],
    topics: ['부부', '은퇴', '역할', '갈등', '화해', '함께 생활'],
    quirks: ['부부 갈등 솔직하게', '유머 섞어서', '해결 과정 담담하게', '😂 이모지 하나'],
    examples: ['남편 퇴직하고 집에 있으니까 처음엔 너무 힘들었어요 😂 이제 각자 시간 정해서 방에 있기로 했어요~', '남편이 설거지 시작했어요! 3년 걸렸어요. 지적하지 말고 기다리는 게 답인 것 같아요.'],
  },
  {
    id: 'AS', nickname: '노후가계부', board: 'LIFE2',
    style: '가계부, 소비 기록, 노후 지출 관리',
    patterns: ['~얼마 썼나 보니', '~이걸 줄였어요', '~기록해보세요'],
    topics: ['가계부', '지출', '노후 생활비', '절약', '소비 패턴'],
    quirks: ['월 총액 공개', '항목별 줄인 내용', '이모지 없음', '실천 가능한 팁'],
    examples: ['이번 달 외식비가 38만원이더라고요. 너무 많아서 다음 달은 주 1회로 줄이기로 했어요.', '가계부 쓰기 시작한 지 6개월 됐어요. 월 17만원이 새고 있었더라고요. 모르면 못 줄여요.'],
  },
  {
    id: 'AT', nickname: '해외이민꿈꾸다', board: 'LIFE2',
    style: '해외 은퇴이민, 이민 정보, 해외 생활 비교',
    patterns: ['~알아봤어요', '~어떨까요?', '~생각 중이에요'],
    topics: ['해외이민', '태국', '말레이시아', '포르투갈', '은퇴이민', '물가'],
    quirks: ['생활비 비교 구체적으로', '설레는 톤', '현실적 고민도 포함', '✈️ 이모지 하나'],
    examples: ['태국 치앙마이 월 생활비 120만원이면 된다는데 진짜예요 ✈️ 1년 계획으로 살아볼까 생각 중이에요~', '포르투갈 은퇴비자 알아봤는데 조건이 생각보다 복잡해요. 그래도 유럽에서 늙고 싶다는 꿈이 있어요.'],
  },
  // ── HUMOR 추가 5명 (AU~AY) ─────────────────────────────────────
  {
    id: 'AU', nickname: '급발진할머니', board: 'HUMOR',
    style: '황당한 일상, 가족 사건, 예상 못한 반전',
    patterns: ['근데 있잖아요ㅋㅋ', '이게 무슨ㅋㅋ', '말도 안 돼요ㅋㅋ'],
    topics: ['황당한 일상', '가족 사건', '예상치 못한 일', '현실 유머'],
    quirks: ['반전이 있는 에피소드', '손자·남편 등장 자주', 'ㅋㅋ로 감정 표현', '짧고 빠른 전개'],
    examples: ['근데 있잖아요ㅋㅋ 오늘 냉장고에 핸드폰 넣어놓고 30분 찾았어요. 핸드폰이 얼어 있었어요ㅋㅋㅋ', '손자한테 스마트폰 배우는데 손자가 "할머니 또?" 하더라고요 ㅋㅋ 이 녀석이!'],
  },
  {
    id: 'AV', nickname: '사투리유머왕', board: 'HUMOR',
    style: '지방 사투리, 말투 차이, 웃긴 오해',
    patterns: ['~아이가요ㅋㅋ', '~카이ㅋㅋ', '이라고ㅋㅋ'],
    topics: ['사투리', '방언', '지역 문화', '오해', '웃긴 상황'],
    quirks: ['경상도/전라도 사투리 섞어 쓰기', '표준어와 비교', '실제 오해 에피소드', '자연스러운 방언'],
    examples: ['서울 온 첫날 "아이가요?" 했더니 다들 어리둥절ㅋㅋ 경상도는 "아닌가요?" 라는 뜻이에요!', '"국 마셔" 했더니 서울 조카가 "국을 마셔요?"ㅋㅋㅋ 경상도선 국 먹는 걸 마신다고 해요.'],
  },
  {
    id: 'AW', nickname: '현실관찰일지', board: 'HUMOR',
    style: '주변 관찰, 현실 유머, 공감 에피소드',
    patterns: ['이거 저만 그래요?ㅋㅋ', '보면 볼수록ㅋㅋ', '어이없지만ㅋㅋ'],
    topics: ['일상 관찰', '공감 유머', '나이 듦', '현실 직면', '소소한 황당함'],
    quirks: ['"이거 저만요?" 공감 유도', '공감 폭발 포인트 하나', '짧고 일상적인', '😂 이모지 하나'],
    examples: ['이거 저만 그래요?ㅋㅋ 계단 다 올라가고 왜 올라왔는지 까먹는 거 😂 1층 내려가면 또 생각남', '안경 찾다가 이마에 있던 거 발견했어요ㅋㅋ 이제 일주일에 한 번은 이래요. 노화인가요ㅋㅋ'],
  },
  {
    id: 'AX', nickname: '남편관찰일기', board: 'HUMOR',
    style: '남편 행동 관찰, 부부 유머, 웃긴 갈등',
    patterns: ['우리 남편이ㅋㅋ', '이 양반이ㅋㅋ', '진짜 어이없죠?ㅋㅋ'],
    topics: ['남편', '부부', '일상 갈등', '웃긴 상황', '남편 어록'],
    quirks: ['남편을 "이 양반" "이 분" 등으로 지칭', '황당함+애정 공존', '남편 어록 인용', '공감 유발'],
    examples: ['우리 남편이 냉장고 앞에서 "뭐 없어?" 하길래 열어서 보여줬더니 "그거 말고"ㅋㅋ 그럼 뭐가 있어야 해요!', '이 양반이 드디어 세탁기 쓸 줄 안대요ㅋㅋ 근데 빨간 옷이랑 흰 옷 같이 돌렸어요ㅋㅋ 분홍색 팬티가 탄생했습니다'],
  },
  {
    id: 'AY', nickname: '손주에게지다', board: 'HUMOR',
    style: '손주한테 현실에서 지는 할머니 유머',
    patterns: ['손주한테 졌어요ㅋㅋ', '이 꼬마가ㅋㅋ', '얘가 어떻게 알았어요ㅋㅋ'],
    topics: ['손주', '어린이 논리', '할머니 패배', '귀여운 황당함'],
    quirks: ['손주가 항상 이김', '"이 꼬마가" 으로 손주 지칭', '황당하지만 뿌듯한 톤', '😍 이모지 하나'],
    examples: ['손주한테 졌어요ㅋㅋ "할머니는 왜 주름이 있어요?" 했길래 "오래 살아서" 했더니 "그럼 나쁜 거잖아요"ㅋㅋ 😍', '이 꼬마가 어떻게 알았어요ㅋㅋ 사탕 숨겨놨더니 냄새 맡고 찾아왔어요. 강아지도 아닌데!!'],
  },
]

// 욕망별 우선 페르소나 (매칭 실패 시 폴백용) — 페르소나 편중 방지를 위해 풀 최대 확대
const DESIRE_PERSONA_MAP: Record<string, string[]> = {
  // STORY 카테고리 — 욕망별 관련 페르소나 최대 배치
  HEALTH:    ['H', 'M', 'X', 'A', 'F', 'Z', 'Y', 'N', 'T', 'E'],
  FAMILY:    ['L', 'E', 'V', 'AA', 'AB', 'A', 'W', 'Q'],
  RELATION:  ['E', 'V', 'AB', 'A', 'W', 'T', 'L', 'P', 'O'],
  MEANING:   ['W', 'T', 'I', 'E', 'AB', 'P', 'AA', 'V', 'O'],
  HOBBY:     ['F', 'S', 'U', 'Y', 'Z', 'O', 'I', 'K', 'M', 'X', 'Q', 'G', 'AA'],
  FOOD:      ['J', 'A', 'G', 'N', 'P', 'K', 'F', 'S'],
  SPIRITUAL: ['W', 'I', 'T', 'E', 'P', 'AB', 'O', 'V'],
  BEAUTY:    ['K', 'A', 'G', 'E', 'U', 'P', 'V'],
  DIGITAL:   ['A', 'E', 'G', 'T', 'N', 'AC', 'O', 'I'],
  FASHION:   ['K', 'A', 'G', 'E', 'U', 'P', 'V', 'AC'],
  PET:       ['Q', 'Y', 'A', 'E', 'F', 'S', 'Z'],
  FREEDOM:   ['G', 'P', 'AC', 'M', 'X', 'A', 'E', 'W', 'I', 'F'],
  // HUMOR 카테고리 — 7명 전원
  HUMOR:     ['C', 'R', 'AU', 'AV', 'AW', 'AX', 'AY'],
  ENTERTAIN: ['C', 'R', 'AW', 'AX', 'AU', 'I', 'O'],
  // LIFE2 카테고리 — 기존 유지 (전용 페르소나)
  MONEY:     ['B', 'AD', 'AE', 'AI', 'AQ', 'AS'],   // 재테크·연금·세금·ETF·가계부
  RETIRE:    ['B', 'AH', 'AN', 'AR', 'AT', 'AO'],   // 은퇴·재취업·연금생활·해외이민·디지털
  HOUSING:   ['AG', 'AJ', 'AL', 'AM', 'AK', 'AF'],  // 부동산·주택연금·전원·실버타운·의료·보험
  // GENERAL — STORY 25명 전원 (null desireCategory 폴백 핵심)
  GENERAL:   ['A', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
               'N', 'O', 'P', 'Q', 'S', 'T', 'U', 'V', 'W', 'X',
               'Y', 'Z', 'AA', 'AB', 'AC'],
}

/** 트렌드 주제에 가장 적합한 페르소나 매칭 */
function matchPersona(topic: string, desireCat?: string): PersonaMatch {
  const topicLower = topic.toLowerCase()

  // 토픽 키워드와 페르소나 관심사 매칭
  let bestMatch = PERSONAS[0]
  let bestScore = 0

  for (const persona of PERSONAS) {
    let score = 0
    for (const t of persona.topics) {
      if (topicLower.includes(t) || t.includes(topicLower)) {
        score += 2
      }
    }
    // 스타일 매칭
    if (persona.style.toLowerCase().includes(topicLower)) score += 1

    if (score > bestScore) {
      bestScore = score
      bestMatch = persona
    }
  }

  // LIFE2 카테고리(MONEY/RETIRE/HOUSING)는 bestScore 무관하게 전용 페르소나 강제 배정
  const LIFE2_DESIRES = new Set(['MONEY', 'RETIRE', 'HOUSING'])
  if (desireCat && LIFE2_DESIRES.has(desireCat)) {
    const pool = DESIRE_PERSONA_MAP[desireCat]
    const id = pool[Math.floor(Math.random() * pool.length)]
    return PERSONAS.find(p => p.id === id) ?? PERSONAS[0]
  }

  // 매칭 안 되면 욕망 카테고리 기반 폴백 (B13 — A/E/G 편중 제거)
  if (bestScore === 0) {
    const fallbackIds = DESIRE_PERSONA_MAP[desireCat ?? 'GENERAL'] ?? DESIRE_PERSONA_MAP['GENERAL']
    const fallbackId = fallbackIds[Math.floor(Math.random() * fallbackIds.length)]
    bestMatch = PERSONAS.find(p => p.id === fallbackId) ?? PERSONAS[0]
  }

  return bestMatch
}

// 욕망 → boardType + category 통합 매핑 (B21/B23/B26 통합 수정)
// generator.ts categoryMap과 반드시 일치: STORY=['건강','가족','취미','고민','자유수다'] HUMOR=['유머·웃음','엔터·TV','추천·리뷰','기타'] LIFE2=['은퇴준비','재테크·연금','보험','주거·이사']
const DESIRE_TO_BOARD: Record<string, { boardType: 'STORY' | 'HUMOR' | 'LIFE2' | 'JOB'; category: string }> = {
  HEALTH:    { boardType: 'STORY', category: '건강' },
  BEAUTY:    { boardType: 'STORY', category: '건강' },
  FAMILY:    { boardType: 'STORY', category: '가족' },
  RELATION:  { boardType: 'STORY', category: '고민' },
  MEANING:   { boardType: 'STORY', category: '고민' },
  SPIRITUAL: { boardType: 'STORY', category: '고민' },
  HOBBY:     { boardType: 'STORY', category: '취미' },
  FOOD:      { boardType: 'STORY', category: '취미' },
  FASHION:   { boardType: 'STORY', category: '취미' },
  DIGITAL:   { boardType: 'STORY', category: '취미' },
  PET:       { boardType: 'STORY', category: '취미' },
  FREEDOM:   { boardType: 'STORY', category: '자유수다' },
  MONEY:     { boardType: 'LIFE2', category: '재테크·연금' },
  RETIRE:    { boardType: 'LIFE2', category: '은퇴준비' },
  HOUSING:   { boardType: 'LIFE2', category: '주거·이사' },
  JOB:       { boardType: 'JOB',   category: '전체' },
  HUMOR:     { boardType: 'HUMOR', category: '유머·웃음' },
  ENTERTAIN: { boardType: 'HUMOR', category: '엔터·TV' },
  GENERAL:   { boardType: 'STORY', category: '자유수다' },
}

/** 참고용 원본 글 가져오기 — 3단계 fallback (B19+B24)
 * 1단계: 48h + 키워드 / 2단계: 7일 + 키워드 / 3단계: 7일 + desireCategory만
 */
async function getReferencePosts(topic: string, desireCat: string, limit: number) {
  const base = { isUsable: true, usedAt: null, isPopular: false }
  const topicWords = topic.split(/[\s·,]+/).filter(w => w.length >= 2)
  const firstWord = topicWords[0] ?? topic
  const selectFields = { id: true, title: true, content: true, cafeName: true } as const

  // 1단계: 48h + 키워드
  const cutoff48h = new Date(Date.now() - 48 * 3600_000)
  const stage1 = await prisma.cafePost.findMany({
    where: { ...base, postedAt: { gte: cutoff48h }, OR: [{ title: { contains: firstWord, mode: 'insensitive' } }, { topics: { hasSome: topicWords } }] },
    orderBy: [{ killerScore: 'desc' }, { likeCount: 'desc' }],
    take: limit, select: selectFields,
  })
  if (stage1.length >= limit) return stage1

  // 2단계: 7일 + 키워드
  const cutoff7d = new Date(Date.now() - 7 * 24 * 3600_000)
  const stage2 = await prisma.cafePost.findMany({
    where: { ...base, postedAt: { gte: cutoff7d }, OR: [{ title: { contains: firstWord, mode: 'insensitive' } }, { topics: { hasSome: topicWords } }] },
    orderBy: [{ killerScore: 'desc' }, { likeCount: 'desc' }],
    take: limit, select: selectFields,
  })
  if (stage2.length >= limit) return stage2

  // 3단계: 7일 + desireCategory만 (키워드 없이)
  const stage3 = await prisma.cafePost.findMany({
    where: { ...base, postedAt: { gte: cutoff7d }, ...(desireCat !== 'GENERAL' ? { desireCategory: desireCat } : {}) },
    orderBy: [{ killerScore: 'desc' }, { likeCount: 'desc' }],
    take: limit, select: selectFields,
  })
  return stage3
}

/** 큐레이션된 글 생성 — 원본 카페글 제목·본문 그대로 사용 (AI 각색 없음) */
async function generateCuratedPost(
  persona: PersonaMatch,
  topic: string,
  referencePosts: { id: string; title: string; content: string; cafeName: string }[],
  desireCat?: string,
): Promise<CuratedContent | null> {
  const mainRef = referencePosts[0]
  if (!mainRef) return null

  const boardInfo = DESIRE_TO_BOARD[desireCat ?? 'GENERAL'] ?? DESIRE_TO_BOARD['GENERAL']

  const title = stripMarkdown(mainRef.title.trim())
  if (!title) return null

  return {
    personaId: persona.id,
    title,
    content: stripMarkdown(mainRef.content.trim()),
    boardType: boardInfo.boardType,
    category: boardInfo.category,
    sourceTopic: topic,
    sourcePostIds: [mainRef.id],
  }
}

const SEASONAL_KEYWORDS: Record<string, number[]> = {
  '벚꽃': [3, 4], '꽃구경': [3, 4, 5], '벚꽃놀이': [3, 4],
  '장마': [6, 7], '여름휴가': [7, 8], '피서': [7, 8], '물놀이': [7, 8],
  '단풍': [10, 11], '단풍놀이': [10, 11],
  '크리스마스': [12], '눈썰매': [12, 1, 2], '설날': [1, 2],
}

function isSeasonMismatch(title: string, content: string): boolean {
  const text = title + ' ' + content
  const currentMonth = new Date().getMonth() + 1
  for (const [keyword, allowedMonths] of Object.entries(SEASONAL_KEYWORDS)) {
    if (text.includes(keyword) && !allowedMonths.includes(currentMonth)) return true
  }
  return false
}

function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
  return dp[m][n]
}

/** 큐레이션 글을 DB에 게시, 생성된 postId 반환 */
async function publishCuratedContent(curated: CuratedContent): Promise<string | null> {
  const userId = await getBotUser(curated.personaId)

  const htmlContent = `<p>${curated.content.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`
  const summary = curated.content.replace(/\n/g, ' ').slice(0, 150).trim()

  // 계절 불일치 필터 (P3)
  if (isSeasonMismatch(curated.title, curated.content)) {
    console.log(`[ContentCurator] 계절 불일치 스킵: "${curated.title.slice(0, 20)}"`)
    return null
  }

  // 크로스소스 중복 방지 (LIFE2·STORY·HUMOR — Seed·PopularCurator와 동일 주제 중복 차단)
  if (['LIFE2', 'STORY', 'HUMOR'].includes(curated.boardType)) {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recentPosts = await prisma.post.findMany({
      where: { boardType: curated.boardType as 'LIFE2' | 'STORY' | 'HUMOR', createdAt: { gte: since24h } },
      select: { title: true },
    })
    if (recentPosts.length > 0) {
      const toNouns = (t: string) => t.match(/[가-힣]{2,}/g) ?? []
      const newNouns = new Set(toNouns(curated.title))
      const isDuplicate = recentPosts.some(
        p => toNouns(p.title).filter(n => newNouns.has(n)).length >= 2
      )
      const isTitleNearDuplicate = recentPosts.some(
        p => editDistance(p.title, curated.title) <= 5
      )
      if (isDuplicate || isTitleNearDuplicate) {
        console.log(`[ContentCurator] ${curated.boardType} 중복 스킵: "${curated.title.slice(0, 20)}"`)
        return null
      }
    }
  }

  // post 생성 + cafePost usedAt 마킹을 트랜잭션으로 묶어 원자성 보장
  const postId = await prisma.$transaction(async (tx) => {
    const post = await tx.post.create({
      data: {
        title: curated.title,
        content: htmlContent,
        summary,
        boardType: curated.boardType as 'STORY' | 'HUMOR' | 'LIFE2' | 'JOB',
        category: curated.category ?? '자유수다',
        authorId: userId,
        source: 'BOT',
        status: 'PUBLISHED',
        publishedAt: new Date(),
        cafePostId: curated.sourcePostIds[0] ?? null,
      },
    })
    if (curated.sourcePostIds.length > 0) {
      await tx.cafePost.updateMany({
        where: { id: { in: curated.sourcePostIds } },
        data: { usedAt: new Date() },
      })
      // killerScore ≥ 75인 소스글 기반 발행 → isFeatured=true 자동 적용
      const killerSource = await tx.cafePost.findFirst({
        where: { id: { in: curated.sourcePostIds }, killerScore: { gte: 75 } },
        select: { id: true },
      })
      if (killerSource) {
        await tx.post.update({
          where: { id: post.id },
          data: { isFeatured: true, featuredAt: new Date() },
        })
      }
    }
    return post.id
  })

  return postId
}

/** 댓글 파동 큐 등록 (wave1: +1분, wave2: +5분, wave3: +30분, wave4: +60분) */
async function enqueueCommentWave(postId: string, cafePostId: string, authorPersonaId: string) {
  const now = new Date()
  await prisma.commentWaveQueue.create({
    data: {
      postId,
      cafePostId,
      authorPersonaId,
      wave1At: new Date(now.getTime() + 60_000),
      wave2At: new Date(now.getTime() + 300_000),
      wave3At: new Date(now.getTime() + 1_800_000),
      wave4At: new Date(now.getTime() + 3_600_000),
      expiresAt: new Date(now.getTime() + 216_000_000), // 60시간
    },
  })
}

/** 메인 실행 */
export async function main() {
  console.log('[ContentCurator] 시작 — 트렌드 기반 콘텐츠 큐레이션')
  const startTime = Date.now()

  // 1) 핫토픽 조회 (오늘 트렌드 → 어제 → 최근 순으로 fallback)
  const { hotTopics, desireMap: trendDesireMap, source: briefSource } = await loadTodayBrief()
  if (!hotTopics || hotTopics.length === 0) {
    console.log(`[ContentCurator] 핫토픽 없음 (source: ${briefSource}) — 트렌드 분석 먼저 필요`)
    await disconnect()
    return
  }
  console.log(`[ContentCurator] 핫토픽 ${hotTopics.length}개 로드 (source: ${briefSource})`)
  // DailyBrief fallback 경고 (B12) — 오늘 데이터 없음 → 욕망 신뢰도 낮음
  if (briefSource === 'yesterday_trend' || briefSource === 'recent_trend') {
    await sendSlackMessage('SYSTEM', `[큐레이션] DailyBrief fallback 모드 (source=${briefSource}) — 오늘 트렌드 없음, 욕망 데이터 신뢰도 낮음`)
  }

  // 2) 카테고리 다양화 — desireMap 기반으로 HEALTH 독점 방지
  const maxPosts = 5
  let publishedCount = 0

  // 오늘 이미 발행된 욕망 집계 — 시간당 동일 욕망 반복 방지 (B20)
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayUsedPosts = await prisma.cafePost.findMany({
    where: { usedAt: { gte: todayStart } },
    select: { desireCategory: true },
  })
  const desireUsedCount: Record<string, number> = {}
  for (const { desireCategory } of todayUsedPosts) {
    const key = desireCategory ?? 'GENERAL'
    desireUsedCount[key] = (desireUsedCount[key] ?? 0) + 1
  }

  // 오늘 발행된 BOT 글 제목 목록 — 키워드 편중 방지 (P1)
  const todayPublishedTitles = await prisma.post.findMany({
    where: { source: 'BOT', createdAt: { gte: todayStart } },
    select: { title: true },
  })
  // keyword overlap 오탐 방지 — 어미·조사·기능어는 주제어가 아니므로 제외
  const OVERLAP_STOPWORDS = new Set([
    '해요', '이요', '에요', '어요', '아요', '해서', '하고', '해도',
    '가요', '이야', '거야', '줘요', '봐요', '되요', '는데', '인데',
    '같아', '같이', '있어', '없어', '싶어', '했어', '봤어', '갔어',
    '에서', '으로', '에게', '이나', '거나', '에도', '이도', '이고',
    '이게', '그게', '저게', '이건', '그건', '저건',
    '많이', '너무', '정말', '진짜', '아직', '이미', '그냥', '항상',
    '오늘', '내일', '어제', '이번', '지난', '다음',
    '데이',
  ])
  function countKeywordOverlap(title: string): number {
    const nouns = (title.match(/[가-힣]{2,}/g) ?? [])
      .filter(n => !OVERLAP_STOPWORDS.has(n))
    const publishedAll = todayPublishedTitles.map(p => p.title).join(' ')
    let max = 0
    for (const n of nouns) {
      const cnt = publishedAll.match(new RegExp(n, 'g'))?.length ?? 0
      if (cnt > max) max = cnt
    }
    return max
  }

  // 욕망별 하루 최대 발행 수 (75건/일 기준 30%/15%/8%)
  const MAX_PER_DESIRE: Partial<Record<string, number>> = { HEALTH: 22, FAMILY: 11, MONEY: 3 }
  const DEFAULT_MAX_DESIRE = 6

  // 욕망 카테고리 키워드 매핑 (hotTopic 분류용)
  const DESIRE_KEYWORDS: Record<string, string[]> = {
    HEALTH:   ['건강', '병원', '약', '증상', '통증', '다이어트', '운동', '혈압', '당뇨', '갱년기', '검진'],
    FAMILY:   ['자녀', '아들', '딸', '남편', '며느리', '손주', '부모', '시어머니', '가족', '부부'],
    MONEY:    ['돈', '재테크', '연금', '절약', '투자', '부동산', '물가', '주식', '적금', '노후'],
    RETIRE:   ['은퇴', '퇴직', '노후', '일자리', '재취업', '인생2막', '정년'],
    RELATION: ['친구', '모임', '갈등', '화해', '관계', '이웃', '섭섭'],
    HOBBY:    ['취미', '여행', '등산', '텃밭', '독서', '공예', '수영', '골프', '바둑', '자전거', '캠핑', '낚시', '뜨개질', '서예', '그림', '꽃꽂이'],
    MEANING:  ['삶', '의미', '행복', '감사', '성찰', '기억', '회고'],
    HUMOR:    ['웃긴', '황당', '유머', '재미', '웃음', '황당'],
    ENTERTAIN:['드라마', '예능', '연예인', '배우', '아이돌', 'TV', '방송', '넷플릭스', '유튜브'],
    BEAUTY:   ['피부', '미용', '성형', '뷰티', '보톡스', '화장품', '피부과', '안티에이징'],
    DIGITAL:  ['스마트폰', '앱', '유튜브', '카카오', '키오스크', 'SNS', '유튜버', '인터넷'],
    FOOD:     ['맛집', '요리', '음식', '식당', '레시피', '먹방', '건강식', '식단'],
    SPIRITUAL:['종교', '기도', '사주', '운세', '교회', '절', '성당', '명상', '불교'],
    HOUSING:  ['집', '이사', '인테리어', '전세', '월세', '아파트', '청약', '주거'],
    FASHION:  ['옷', '패션', '스타일', '코디', '쇼핑', '명품', '브랜드'],
    PET:      ['강아지', '고양이', '반려견', '반려묘', '동물병원', '펫', '반려동물'],
  }

  function guessDesire(topicStr: string | null | undefined): string {
    if (!topicStr) return 'GENERAL'
    const lower = topicStr.toLowerCase()
    for (const [cat, keywords] of Object.entries(DESIRE_KEYWORDS)) {
      if (keywords.some(kw => lower.includes(kw))) return cat
    }
    return 'GENERAL'
  }

  function isDesireExhausted(desire: string): boolean {
    return (desireUsedCount[desire] ?? 0) >= (MAX_PER_DESIRE[desire] ?? DEFAULT_MAX_DESIRE)
  }

  // desireMap 기반 다양화: HEALTH 30% 상한 적용 후 재정규화 (B10 — 구조적 편중 완화)
  const DESIRE_CAPS: Partial<Record<string, number>> = { HEALTH: 30 }
  const rawDesireMap = trendDesireMap ?? {}
  const cappedMap: Record<string, number> = {}
  let totalPct = 0
  for (const [d, pct] of Object.entries(rawDesireMap)) {
    cappedMap[d] = Math.min(Number(pct), DESIRE_CAPS[d] ?? 100)
    totalPct += cappedMap[d]
  }
  const desireMap: Record<string, number> = {}
  for (const d of Object.keys(cappedMap)) {
    desireMap[d] = totalPct > 0 ? (cappedMap[d] / totalPct) * 100 : 0
  }
  const topDesires = Object.entries(desireMap).sort(([, a], [, b]) => b - a).map(([k]) => k)

  const categorizedTopics = hotTopics.map(t => ({ ...t, desireCategory: guessDesire(t.topic) }))
  const selectedTopics: string[] = []
  const usedCategories = new Set<string>()

  // 1순위: desireMap 순서대로 카테고리별 첫 번째 hotTopic (소진된 욕망 제외)
  for (const desire of topDesires) {
    if (selectedTopics.length >= maxPosts) break
    if (isDesireExhausted(desire)) continue
    const match = categorizedTopics.find(t => t.desireCategory === desire && !usedCategories.has(desire))
    if (match) {
      selectedTopics.push(match.topic)
      usedCategories.add(desire)
    }
  }
  // 2순위: 미달 시 나머지 hotTopics에서 카테고리 중복 없이 채움 (소진된 욕망 제외)
  for (const t of categorizedTopics) {
    if (selectedTopics.length >= maxPosts) break
    if (isDesireExhausted(t.desireCategory)) continue
    if (!usedCategories.has(t.desireCategory) && !selectedTopics.includes(t.topic)) {
      selectedTopics.push(t.topic)
      usedCategories.add(t.desireCategory)
    }
  }
  // 3순위: 폴백 — 원래 hotTopics 순서
  for (const t of hotTopics) {
    if (selectedTopics.length >= maxPosts) break
    if (!selectedTopics.includes(t.topic)) selectedTopics.push(t.topic)
  }

  // 01:15 KST 특별 슬롯: 저녁/새벽 감성글 우선 정렬 (killerScore 블록 이전 배치)
  // kstHour = (getUTCHours() + 9) % 24 → UTC 16시 = (16+9)%24 = 1 = KST 01시
  const kstHour = (new Date().getUTCHours() + 9) % 24
  const DAWN_DESIRES = ['MEANING', 'SPIRITUAL', 'RELATION', 'FAMILY']
  if (kstHour === 1) {
    selectedTopics.sort((a, b) => {
      const aIsDawn = DAWN_DESIRES.includes(guessDesire(a))
      const bIsDawn = DAWN_DESIRES.includes(guessDesire(b))
      return (bIsDawn ? 1 : 0) - (aIsDawn ? 1 : 0)
    })
  }

  // killerScore 우선 삽입 (B3) — 화제성 높은 글 제목을 최우선 주제로
  const killerPosts = await prisma.cafePost.findMany({
    where: { killerScore: { gte: 55 }, isUsable: true, usedAt: null, isPopular: false }, // 55: 조용한 게시판 포용 (기존 70에서 완화)
    orderBy: { killerScore: 'desc' },
    take: 2,
    select: { title: true },
  })
  if (killerPosts.length > 0) {
    const killerTopics = killerPosts.map(p => p.title).filter(Boolean)
    const merged = [...killerTopics, ...selectedTopics.filter(t => !killerTopics.includes(t))].slice(0, maxPosts)
    selectedTopics.splice(0, selectedTopics.length, ...merged)
    console.log(`[ContentCurator] 킬러글 우선 삽입: ${killerTopics.length}건`)
  }

  for (const topicStr of selectedTopics) {
    const desireCat = guessDesire(topicStr)
    // 하루 한도 소진된 욕망은 스킵 (B20)
    if (isDesireExhausted(desireCat)) {
      console.log(`[ContentCurator] "${topicStr}" (${desireCat}) 오늘 한도 초과 — 스킵`)
      continue
    }

    // 당일 발행 키워드 편중 체크 (P1)
    const topicOverlap = countKeywordOverlap(topicStr)
    if (topicOverlap >= 3) {
      console.log(`[ContentCurator] "${topicStr}" 키워드 중복 스킵 (당일 ${topicOverlap}회 이미 발행)`)
      continue
    }

    const persona = matchPersona(topicStr, desireCat)
    const refs = await getReferencePosts(topicStr, desireCat, 3)

    console.log(`[ContentCurator] "${topicStr}" (${desireCat}) → ${persona.nickname} (참고글 ${refs.length}개)`)

    const curated = await generateCuratedPost(persona, topicStr, refs, desireCat)
    if (curated) {
      const postId = await publishCuratedContent(curated)
      publishedCount++
      desireUsedCount[desireCat] = (desireUsedCount[desireCat] ?? 0) + 1
      console.log(`[ContentCurator] 게시: "${curated.title}" by ${persona.nickname}`)
      // 댓글 파동 큐 등록 — refs 없어도 등록 (wave-processor가 fallback 댓글 생성)
      if (postId) {
        if (refs.length === 0) {
          await sendSlackMessage('QA', `[큐레이션] wave 등록: refs 없음 fallback 모드 (topic=${topicStr})`)
        }
        await enqueueCommentWave(postId, refs[0]?.id ?? '', persona.id).catch(async (err) => {
          await sendSlackMessage('QA', `[큐레이션] wave 등록 실패: ${String(err).slice(0, 100)}`)
          console.error('[ContentCurator] wave 큐 등록 실패:', err)
        })
      }
    }
  }

  const durationMs = Date.now() - startTime

  // BotLog
  await prisma.botLog.create({
    data: {
      botType: 'CAFE_CRAWLER',
      action: 'CONTENT_CURATE',
      status: publishedCount >= maxPosts ? 'SUCCESS' : publishedCount > 0 ? 'PARTIAL' : 'FAILED',
      details: JSON.stringify({
        topicsUsed: selectedTopics,
        published: publishedCount,
      }),
      itemCount: publishedCount,
      executionTimeMs: durationMs,
    },
  })

  await notifySlack({
    level: 'info',
    agent: 'CONTENT_CURATOR',
    title: '트렌드 기반 콘텐츠 게시',
    body: `핫토픽 ${hotTopics.length}개 중 ${publishedCount}개 글 게시`,
  })

  console.log(`[ContentCurator] 완료 — ${publishedCount}개 게시, ${Math.round(durationMs / 1000)}초`)
  await disconnect()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error('[ContentCurator] 치명적 오류:', err)
      await disconnect()
      process.exit(1)
    })
}
