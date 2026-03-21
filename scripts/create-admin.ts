/**
 * 어드민 계정 생성 CLI
 * Usage: npx tsx scripts/create-admin.ts <email> <nickname> <password>
 */
import 'dotenv/config'
import bcrypt from 'bcrypt'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  const [email, nickname, password] = process.argv.slice(2)

  if (!email || !nickname || !password) {
    console.error('Usage: npx tsx scripts/create-admin.ts <email> <nickname> <password>')
    console.error('Example: npx tsx scripts/create-admin.ts admin@unao.com 운영자 MyP@ss123')
    process.exit(1)
  }

  if (password.length < 8) {
    console.error('비밀번호는 8자 이상이어야 합니다.')
    process.exit(1)
  }

  const existing = await prisma.adminAccount.findUnique({ where: { email } })
  if (existing) {
    console.error(`이미 존재하는 이메일입니다: ${email}`)
    process.exit(1)
  }

  const passwordHash = await bcrypt.hash(password, 12)

  const admin = await prisma.adminAccount.create({
    data: { email, nickname, passwordHash },
  })

  console.log(`✅ 어드민 계정 생성 완료`)
  console.log(`   ID: ${admin.id}`)
  console.log(`   이메일: ${admin.email}`)
  console.log(`   닉네임: ${admin.nickname}`)
}

main()
  .catch((e) => {
    console.error('❌ 에러:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
