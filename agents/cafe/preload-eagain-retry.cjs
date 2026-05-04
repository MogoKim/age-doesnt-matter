// tsx CJS transformer EAGAIN 우회 — Playwright 이후 readFileSync 실패 방지
// @aws-sdk 패키지를 tsx 훅 등록 전 CJS cache에 로드
// → tsx require('@aws-sdk/...') 시 cache hit → readFileSync 호출 없음
'use strict'
// CJS cache 워밍업 (tsx 훅 등록 전, Playwright 전)
try { require('@aws-sdk/client-s3') } catch (_) {}
try { require('@aws-sdk/s3-request-presigner') } catch (_) {}
