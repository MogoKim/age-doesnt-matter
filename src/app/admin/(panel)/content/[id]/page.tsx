import { getAdminPostDetail } from '@/lib/queries/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import PostEditForm from './PostEditForm'
import CommentsPanel from './CommentsPanel'

export const dynamic = 'force-dynamic'

const BOARD_LABEL: Record<string, string> = {
  STORY: '사는이야기',
  HUMOR: '웃음방',
  LIFE2: '2막준비',
  MAGAZINE: '매거진',
  JOB: '내일찾기',
  WEEKLY: '수다방',
}

const STATUS_LABEL: Record<string, string> = {
  PUBLISHED: '게시',
  HIDDEN: '숨김',
  DELETED: '삭제',
  DRAFT: '임시',
}

export default async function AdminPostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const post = await getAdminPostDetail(id)
  if (!post) notFound()

  return (
    <div className="max-w-3xl space-y-8 py-6">
      <Link href="/admin/content" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← 목록으로
      </Link>

      <div className="flex flex-wrap gap-3 text-sm text-zinc-500">
        <span className="rounded bg-zinc-100 px-2 py-0.5 font-medium text-zinc-700">
          {BOARD_LABEL[post.boardType] ?? post.boardType}
        </span>
        <span className="rounded bg-zinc-100 px-2 py-0.5">
          {STATUS_LABEL[post.status] ?? post.status}
        </span>
        <span>@{post.author?.nickname ?? '탈퇴한 회원'}</span>
        <span>{post.createdAt.toLocaleDateString('ko-KR')}</span>
      </div>

      <PostEditForm postId={post.id} title={post.title} content={post.content} seoTitle={post.seoTitle} seoDescription={post.seoDescription} />

      <CommentsPanel comments={post.comments} />
    </div>
  )
}
