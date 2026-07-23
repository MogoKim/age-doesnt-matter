
-- CreateEnum
CREATE TYPE "EventAudience" AS ENUM ('ALL', 'GUEST', 'MEMBER');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "audience" "EventAudience" NOT NULL DEFAULT 'ALL';

