import type { CandidateResult } from '../api/generated'
import { Badge } from '../components/ui/badge'
import { Progress } from '../components/ui/progress'

const DECISION_STYLES: Record<string, string> = {
  hire: 'bg-green-100 text-green-800 border-green-200',
  borderline: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  no_hire: 'bg-red-100 text-red-800 border-red-200',
}

const DECISION_LABELS: Record<string, string> = {
  hire: 'Hire',
  borderline: 'Borderline',
  no_hire: 'No Hire',
}

interface Props {
  results: CandidateResult[]
  nameMap: Record<string, string>  // candidate_id → display name
}

export function CandidateTable({ results, nameMap }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">
        Результаты — {results.length} кандидат{results.length === 1 ? '' : results.length < 5 ? 'а' : 'ов'}
      </h2>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left w-8">#</th>
              <th className="px-3 py-2 text-left">Кандидат</th>
              <th className="px-3 py-2 text-left w-32">Score</th>
              <th className="px-3 py-2 text-left w-28">Решение</th>
              <th className="px-3 py-2 text-left">Навыки</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {results.map((r, i) => (
              <CandidateRow
                key={r.candidate_id}
                rank={i + 1}
                result={r}
                name={nameMap[r.candidate_id] ?? r.candidate_id}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CandidateRow({ rank, result, name }: { rank: number; result: CandidateResult; name: string }) {
  const pct = Math.round(result.match_score * 100)

  return (
    <tr className="hover:bg-muted/30 transition-colors align-top">
      <td className="px-3 py-3 text-muted-foreground">{rank}</td>
      <td className="px-3 py-3 font-medium">{name}</td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <Progress value={pct} className="h-1.5 w-16" />
          <span className="tabular-nums text-xs">{pct}%</span>
        </div>
      </td>
      <td className="px-3 py-3">
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${DECISION_STYLES[result.decision] ?? ''}`}>
          {DECISION_LABELS[result.decision] ?? result.decision}
        </span>
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap gap-1">
          {result.skills_found.map((s) => (
            <Badge key={s} variant="secondary" className="text-xs px-1.5 py-0 bg-green-50 text-green-700 border-green-200">
              {s}
            </Badge>
          ))}
          {result.skills_missing.map((s) => (
            <Badge key={s} variant="outline" className="text-xs px-1.5 py-0 text-muted-foreground">
              {s}
            </Badge>
          ))}
        </div>
      </td>
    </tr>
  )
}
