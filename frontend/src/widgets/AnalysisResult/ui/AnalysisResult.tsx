import ReactMarkdown from 'react-markdown'
import { CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { NODE_LABELS, type AnalysisState, type NodeName } from '@/features/analyze/model/types'

const NODE_ORDER: NodeName[] = ['parse_node', 'gap_node', 'advise_node']

interface Props {
  state: AnalysisState
}

export function AnalysisResult({ state }: Props) {
  if (state.status === 'idle') {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Fill in the form and click "Analyze match"
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        {state.error}
      </div>
    )
  }

  const matchPct = state.matchScore != null ? Math.round(state.matchScore * 100) : null

  return (
    <div className="flex flex-col gap-6">
      {/* Pipeline progress */}
      <div className="flex flex-col gap-3">
        {NODE_ORDER.map(node => {
          const done = state.completedNodes.includes(node)
          const active = state.currentNode === node
          return (
            <div key={node} className="flex items-center gap-3 text-sm">
              {done ? (
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
              ) : active ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span className={done ? 'text-foreground' : active ? 'text-primary font-medium' : 'text-muted-foreground'}>
                {NODE_LABELS[node]}
              </span>
            </div>
          )
        })}
      </div>

      {/* Stats */}
      {(matchPct != null || state.seniority) && (
        <>
          <Separator />
          <div className="flex flex-col gap-3">
            {matchPct != null && (
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Match score</span>
                  <span className="font-medium">{matchPct}%</span>
                </div>
                <Progress value={matchPct} />
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              {state.seniority && (
                <Badge variant="secondary">{state.seniority}</Badge>
              )}
              {state.skillsFound.map(s => (
                <Badge key={s} variant="outline" className="text-green-600 border-green-300">{s}</Badge>
              ))}
              {state.skillsMissing.map(s => (
                <Badge key={s} variant="outline" className="text-red-500 border-red-300">{s}</Badge>
              ))}
            </div>
          </div>
        </>
      )}

      {/* LLM advice */}
      {state.tokens && (
        <>
          <Separator />
          <div className="prose prose-sm max-w-none text-foreground">
            <ReactMarkdown>{state.tokens}</ReactMarkdown>
          </div>
        </>
      )}
    </div>
  )
}
