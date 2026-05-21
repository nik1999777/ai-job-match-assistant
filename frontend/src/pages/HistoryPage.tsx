import { useState } from 'react'
import {
  useHistory,
  useDeleteAnalysis,
  useBatchHistory,
  useDeleteBatchSession,
  useSeekHistory,
  useDeleteSeekSession,
  type AnalysisSummary,
  type BatchSummary,
  type SeekSummary,
} from '../hooks/useHistory'
import { AnalysisDetailPage } from './AnalysisDetailPage'
import { BatchDetailPage } from './BatchDetailPage'
import { SeekDetailPage } from './SeekDetailPage'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { useAuthStore } from '../store/authStore'

interface Props {
  onBack: () => void
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return null
  const pct = Math.round(score * 100)
  const color = pct >= 75 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-600'
  return <span className={`font-semibold text-sm ${color}`}>{pct}%</span>
}

function DecisionBadge({ decision }: { decision: string | null }) {
  if (!decision) return null
  const cls: Record<string, string> = {
    hire: 'bg-green-100 text-green-800',
    no_hire: 'bg-red-100 text-red-800',
    borderline: 'bg-yellow-100 text-yellow-800',
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls[decision] ?? 'bg-muted'}`}>
      {decision.replace('_', ' ')}
    </span>
  )
}

function AnalysisCard({
  item,
  onOpen,
  onDelete,
}: {
  item: AnalysisSummary
  onOpen: (id: number) => void
  onDelete: (id: number) => void
}) {
  return (
    <div
      className="border rounded-xl p-4 space-y-3 bg-card hover:border-foreground/20 hover:shadow-sm transition-all cursor-pointer"
      onClick={() => onOpen(item.id)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {item.seniority && item.seniority !== 'unknown' && (
            <Badge variant="secondary" className="text-xs">{item.seniority}</Badge>
          )}
          <DecisionBadge decision={item.decision} />
          <ScoreBadge score={item.match_score} />
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(item.id) }}
          className="text-muted-foreground hover:text-destructive transition-colors text-sm shrink-0 p-1"
          title="Удалить"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Резюме</p>
          <p className="text-foreground leading-snug">{item.resume_snippet}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Вакансия</p>
          <p className="text-foreground leading-snug">{item.vacancy_snippet}</p>
        </div>
      </div>

      {item.skills_missing.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.skills_missing.slice(0, 6).map((s) => (
            <span key={s} className="px-1.5 py-0.5 bg-red-50 text-red-700 rounded text-xs">{s}</span>
          ))}
          {item.skills_missing.length > 6 && (
            <span className="text-xs text-muted-foreground">+{item.skills_missing.length - 6}</span>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p>
    </div>
  )
}

function BatchCard({
  item,
  onOpen,
  onDelete,
}: {
  item: BatchSummary
  onOpen: (id: number) => void
  onDelete: (id: number) => void
}) {
  return (
    <div
      className="border rounded-xl p-4 space-y-3 bg-card hover:border-foreground/20 hover:shadow-sm transition-all cursor-pointer"
      onClick={() => onOpen(item.id)}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{item.candidate_count} кандидатов</p>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(item.id) }}
          className="text-muted-foreground hover:text-destructive transition-colors text-sm shrink-0 p-1"
          title="Удалить"
        >
          ✕
        </button>
      </div>

      <p className="text-sm text-muted-foreground leading-snug">{item.vacancy_snippet}</p>

      <div className="flex items-center gap-3 text-xs">
        <span className="px-2 py-0.5 rounded bg-green-100 text-green-800 font-medium">
          Hire: {item.hire_count}
        </span>
        <span className="px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 font-medium">
          Borderline: {item.borderline_count}
        </span>
        <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 font-medium">
          No hire: {item.no_hire_count}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p>
    </div>
  )
}

function AnalysisList({ mode }: { mode: string }) {
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)
  const { data, isLoading, isError } = useHistory(page, mode)
  const deleteMutation = useDeleteAnalysis()

  if (selectedId !== null) {
    return <AnalysisDetailPage analysisId={selectedId} onBack={() => setSelectedId(null)} />
  }

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1

  return (
    <div className="space-y-3">
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Удалить анализ?"
        description="Это действие необратимо."
        onConfirm={() => { deleteMutation.mutate(pendingDelete!); setPendingDelete(null) }}
        onCancel={() => setPendingDelete(null)}
      />
      {isLoading && [1, 2, 3].map(i => (
        <div key={i} className="border rounded-xl p-4 h-32 bg-muted animate-pulse" />
      ))}
      {isError && <p className="text-destructive text-sm">Не удалось загрузить историю.</p>}
      {data?.items.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">Анализов ещё нет</p>
          <p className="text-sm mt-1">Запустите первый анализ — он появится здесь</p>
        </div>
      )}
      {data?.items.map(item => (
        <AnalysisCard
          key={item.id}
          item={item}
          onOpen={setSelectedId}
          onDelete={setPendingDelete}
        />
      ))}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Назад</Button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Вперёд</Button>
        </div>
      )}
    </div>
  )
}

function BatchList() {
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)
  const { data, isLoading, isError } = useBatchHistory(page)
  const deleteMutation = useDeleteBatchSession()

  if (selectedId !== null) {
    return <BatchDetailPage sessionId={selectedId} onBack={() => setSelectedId(null)} />
  }

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1

  return (
    <div className="space-y-3">
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Удалить скрининг?"
        description="Это действие необратимо."
        onConfirm={() => { deleteMutation.mutate(pendingDelete!); setPendingDelete(null) }}
        onCancel={() => setPendingDelete(null)}
      />
      {isLoading && [1, 2, 3].map(i => (
        <div key={i} className="border rounded-xl p-4 h-24 bg-muted animate-pulse" />
      ))}
      {isError && <p className="text-destructive text-sm">Не удалось загрузить историю скрининга.</p>}
      {data?.items.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">Скринингов ещё нет</p>
          <p className="text-sm mt-1">Запустите скрининг — он появится здесь</p>
        </div>
      )}
      {data?.items.map(item => (
        <BatchCard
          key={item.id}
          item={item}
          onOpen={setSelectedId}
          onDelete={setPendingDelete}
        />
      ))}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Назад</Button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Вперёд</Button>
        </div>
      )}
    </div>
  )
}

function SeekList() {
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)
  const { data, isLoading, isError } = useSeekHistory(page)
  const deleteMutation = useDeleteSeekSession()

  if (selectedId !== null) {
    return <SeekDetailPage sessionId={selectedId} onBack={() => setSelectedId(null)} />
  }

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1

  return (
    <div className="space-y-3">
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Удалить поиск?"
        description="Это действие необратимо."
        onConfirm={() => { deleteMutation.mutate(pendingDelete!); setPendingDelete(null) }}
        onCancel={() => setPendingDelete(null)}
      />
      {isLoading && [1, 2, 3].map(i => (
        <div key={i} className="border rounded-xl p-4 h-24 bg-muted animate-pulse" />
      ))}
      {isError && <p className="text-destructive text-sm">Не удалось загрузить историю поиска.</p>}
      {data?.items.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">Поисков ещё нет</p>
          <p className="text-sm mt-1">Запустите поиск работы — он появится здесь</p>
        </div>
      )}
      {data?.items.map(item => (
        <SeekCard
          key={item.id}
          item={item}
          onOpen={setSelectedId}
          onDelete={setPendingDelete}
        />
      ))}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Назад</Button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Вперёд</Button>
        </div>
      )}
    </div>
  )
}

function SeekCard({
  item,
  onOpen,
  onDelete,
}: {
  item: SeekSummary
  onOpen: (id: number) => void
  onDelete: (id: number) => void
}) {
  return (
    <div
      className="border rounded-xl p-4 space-y-3 bg-card hover:border-foreground/20 hover:shadow-sm transition-all cursor-pointer"
      onClick={() => onOpen(item.id)}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{item.job_title}</p>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(item.id) }}
          className="text-muted-foreground hover:text-destructive transition-colors text-sm shrink-0 p-1"
          title="Удалить"
        >
          ✕
        </button>
      </div>

      <p className="text-xs text-muted-foreground">{item.result_count} вакансий найдено</p>

      <div className="flex items-center gap-3 text-xs">
        <span className="px-2 py-0.5 rounded bg-green-100 text-green-800 font-medium">
          Отлично: {item.strong_count}
        </span>
        <span className="px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 font-medium">
          Рассмотреть: {item.considering_count}
        </span>
        <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 font-medium">
          Слабые: {item.weak_count}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p>
    </div>
  )
}

type Tab = 'analysis' | 'batch' | 'seek'

export function HistoryPage({ onBack }: Props) {
  const { role } = useAuthStore()
  const isHR = role === 'hr'
  const [tab, setTab] = useState<Tab>('analysis')

  const tabs: { id: Tab; label: string }[] = isHR
    ? [
        { id: 'analysis', label: 'Оценка кандидата' },
        { id: 'batch',    label: 'Скрининг резюме' },
      ]
    : [
        { id: 'analysis', label: 'Анализ резюме' },
        { id: 'seek',     label: 'Поиск работы' },
      ]

  const analysisMode = isHR ? 'hr' : 'seeker'
  const showTabs = tabs.length > 1

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">История</h1>
          <Button variant="outline" size="sm" onClick={onBack}>← Назад</Button>
        </div>

        {showTabs && (
          <div className="flex gap-1 border-b">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={[
                  'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
                  tab === t.id
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {tab === 'analysis' && <AnalysisList mode={analysisMode} />}
        {tab === 'batch' && <BatchList />}
        {tab === 'seek' && <SeekList />}
      </div>
    </div>
  )
}
