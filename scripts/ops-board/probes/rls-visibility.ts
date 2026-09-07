// RLS 가시성 판정 — db-probe.ts 와 check-rls-visibility.ts 의 공용 기준.
//
// 두 곳이 각자 SQL 을 들고 있으면 기준이 서로 어긋나(drift) 한쪽만 통과하는 상태가 생긴다.
// 판정 로직은 이 파일 하나에만 둔다.

/**
 * "전체 행을 읽을 수 있는가"로 판정한다. 정책이 존재하는지가 아니다.
 *
 * Postgres 의 행 가시성은 `(permissive 들의 OR) AND (restrictive 들의 AND)` 이다.
 * 따라서 진단용 role 이 **전체 행**을 보려면 세 가지가 모두 성립해야 한다.
 *   ① 테이블 SELECT 권한이 있다
 *   ② 현재 role(그룹 멤버십 포함) 또는 PUBLIC 대상, cmd 가 SELECT/ALL 이면서
 *      **qual 이 무조건 true** 인 PERMISSIVE 정책이 하나 이상 있다
 *   ③ 현재 role 에 적용되는 RESTRICTIVE 정책 중 qual 이 true 가 아닌 것이 **하나도 없다**
 *
 * 하나라도 어긋나면 차단으로 본다(fail-closed). `USING (false)`·조건부 `USING`·
 * restrictive 정책으로 일부 행만 보이는 상태를 "열림"으로 오판하지 않기 위해서다.
 *
 * BYPASSRLS/superuser role 로 실행하면 RLS 자체가 적용되지 않으므로 차단 목록은 비어야 한다.
 */
export const RLS_BLOCKED_SQL = `
  SELECT c.relname AS t
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relrowsecurity
    AND NOT coalesce(
      (SELECT r.rolbypassrls OR r.rolsuper FROM pg_roles r WHERE r.rolname = current_user),
      false
    )
    AND (
      NOT has_table_privilege(current_user, c.oid, 'SELECT')
      OR NOT EXISTS (
        SELECT 1
        FROM pg_policies p
        WHERE p.schemaname = n.nspname
          AND p.tablename = c.relname
          AND p.permissive = 'PERMISSIVE'
          AND p.cmd IN ('SELECT', 'ALL')
          AND btrim(coalesce(p.qual, '')) = 'true'
          AND EXISTS (
            SELECT 1 FROM unnest(p.roles) AS r
            WHERE r = 'public' OR pg_has_role(current_user, r, 'MEMBER')
          )
      )
      OR EXISTS (
        SELECT 1
        FROM pg_policies p
        WHERE p.schemaname = n.nspname
          AND p.tablename = c.relname
          AND p.permissive = 'RESTRICTIVE'
          AND p.cmd IN ('SELECT', 'ALL')
          AND btrim(coalesce(p.qual, '')) <> 'true'
          AND EXISTS (
            SELECT 1 FROM unnest(p.roles) AS r
            WHERE r = 'public' OR pg_has_role(current_user, r, 'MEMBER')
          )
      )
    )
  ORDER BY 1
`

/**
 * SQL 이 참조하는 public 스키마 테이블명을 뽑는다.
 *
 * 인식 대상:
 *   FROM "Post" · JOIN "Post"
 *   FROM public."Post" · JOIN public."Post"
 *   FROM "public"."Post" · JOIN "public"."Post"
 *
 * 따옴표 없는 이름은 Postgres 가 소문자로 접어 PascalCase 테이블과 매칭되지 않으므로
 * 애초에 동작하지 않는다 → 따옴표 있는 식별자만 추출한다.
 * public 이 아닌 스키마를 명시한 참조는 차단 목록(public 전용)의 대상이 아니므로 제외한다.
 */
export function extractTableNames(sql: string): string[] {
  const found = new Set<string>()
  const re = /\b(?:from|join)\s+(?:"?([A-Za-z_][A-Za-z0-9_$]*)"?\s*\.\s*)?"([^"]+)"/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(sql)) !== null) {
    const schema = m[1]
    if (schema && schema.toLowerCase() !== 'public') continue
    found.add(m[2])
  }
  return [...found]
}

/** 참조 테이블 중 RLS 로 가려진 것만 돌려준다. */
export function findBlockedTables(sql: string, blocked: Set<string>): string[] {
  return extractTableNames(sql).filter((t) => blocked.has(t))
}
