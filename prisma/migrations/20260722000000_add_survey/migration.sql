-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'SURVEY';

-- CreateTable
CREATE TABLE "SurveyForm" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "questions" JSONB NOT NULL,
    "consentText" TEXT,
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurveyForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyResponse" (
    "id" TEXT NOT NULL,
    "surveyFormId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT,
    "guestId" TEXT,
    "answers" JSONB NOT NULL,
    "source" TEXT,
    "path" TEXT,
    "referrer" TEXT,
    "userAgent" TEXT,
    "ipHash" TEXT,
    "consentAccepted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SurveyForm_eventId_key" ON "SurveyForm"("eventId");

-- CreateIndex
CREATE INDEX "SurveyForm_eventId_idx" ON "SurveyForm"("eventId");

-- CreateIndex
CREATE INDEX "SurveyResponse_surveyFormId_createdAt_idx" ON "SurveyResponse"("surveyFormId", "createdAt");

-- CreateIndex
CREATE INDEX "SurveyResponse_eventId_idx" ON "SurveyResponse"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyResponse_surveyFormId_userId_key" ON "SurveyResponse"("surveyFormId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyResponse_surveyFormId_guestId_key" ON "SurveyResponse"("surveyFormId", "guestId");

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_surveyFormId_fkey" FOREIGN KEY ("surveyFormId") REFERENCES "SurveyForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

