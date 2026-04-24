/** 사용자 심층 분석 — 전략 문서 타입 정의 */

export interface StrategicAnalysis {
  /** 1. 인구통계 인사이트 */
  demographicInsights: {
    ageGenderProfile: string
    geographicPatterns: string
    digitalBehavior: string
    keyFindings: string[]
  }

  /** 2. 핵심 욕망 — 데이터에서 드러나는 진짜 니즈 */
  coreDesires: Array<{
    desire: string
    evidence: string
    currentSatisfaction: 'low' | 'medium' | 'high'
    opportunity: string
  }>

  /** 3. 검증된 페르소나 */
  personas: Array<{
    id: string
    name: string
    profile: string
    coreDesire: string
    painPoints: string[]
    contentPreferences: string[]
    platformBehavior: string
    keyMetric: string
    evidenceStrength: 'strong' | 'moderate' | 'hypothesis'
    dataSource: string
  }>

  /** 4. 콘텐츠 전략 인사이트 */
  contentInsights: {
    topEngagingCategories: string[]
    gapAnalysis: string
    saidVsDid: string
    magazineTopicRecommendations: string[]
    communityTopicRecommendations: string[]
  }

  /** 5. 헌법 업데이트 권고안 */
  constitutionUpdates: {
    missionSuggestion: string
    visionSuggestion: string
    essenceSuggestion: string
    personaPriorityChange: string
    contentPolicyChange: string
    toneAdjustment: string
  }

  /** 6. SNS 채널 전략 */
  snsStrategy: {
    primaryPlatform: string
    platformPersonaAlignment: Record<string, string>
    contentTypeByPlatform: Record<string, string[]>
    magazineTopics: string[]
  }

  /** 7. 방법론 & 한계 */
  methodology: {
    dataQuality: string
    sampleSize: string
    limitations: string[]
    recommendedFollowUp: string[]
  }
}

/** 수집된 원시 데이터 구조 */
export interface CollectedData {
  cafeCategoryStats: Array<{ boardCategory: string; _count: number; _avg: { qualityScore: number; likeCount: number; commentCount: number } }>
  topQualityPosts: Array<{ title: string; content: string; boardCategory: string | null; qualityScore: number; likeCount: number; commentCount: number; cafeName: string }>
  topEngagementPosts: Array<{ title: string; boardCategory: string | null; likeCount: number; commentCount: number; viewCount: number; cafeName: string }>
  cafeSentiment: Array<{ boardCategory: string; sentiment: string; _count: number }>
  recentTrends: Array<{ date: Date; hotTopics: unknown; keywords: unknown; personaHints: unknown; magazineTopics: unknown }>
  postEngagement: Array<{ boardType: string; _count: number; _avg: { viewCount: number; likeCount: number; commentCount: number; scrapCount: number } }>
  topTrendingPosts: Array<{ title: string; boardType: string; category: string | null; trendingScore: number; viewCount: number; likeCount: number; commentCount: number; source: string }>
  postBySource: Array<{ source: string; _count: number; _avg: { viewCount: number; likeCount: number } }>
  userDemographics: {
    birthYearDist: Array<{ birthYear: number | null; _count: number }>
    genderDist: Array<{ gender: string | null; _count: number }>
    gradeDist: Array<{ grade: string; _count: number }>
    totalUsers: number
  }
  searchTerms: Array<{ query: string; count: number }>
  topPages: Array<{ path: string; count: number }>
  timePatterns: {
    postsByHour: Array<{ hour: number; count: number }>
    postsByDow: Array<{ dow: number; count: number }>
  }
  socialPerformance: Array<{ contentType: string; _count: number; avgMetrics: unknown }>
  experimentLearnings: Array<{ hypothesis: string; variable: string; learnings: string | null; results: unknown }>
}
