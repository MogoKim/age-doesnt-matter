// .env.local 로드 (DB probe용 OPS_BOARD_READONLY_URL).
// cli.ts / server.ts 의 첫 import로 두어 다른 모듈보다 먼저 평가되게 한다.
import { config } from 'dotenv'

config({ path: '.env.local' })
