import { Badge } from './ui/badge'
import { Progress } from './ui/progress'

interface Props {
  matchScore: number | null
  seniority: string | null
}

export function MatchScore({ matchScore, seniority }: Props) {
  if (matchScore == null && !seniority) return null

  const pct = matchScore != null ? Math.round(matchScore * 100) : null

  return (
    <div className="flex flex-col gap-3">
      {pct != null && (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Совпадение</span>
            <span className="font-medium">{pct}%</span>
          </div>
          <Progress value={pct} />
        </div>
      )}
      {seniority && <Badge variant="secondary">{seniority}</Badge>}
    </div>
  )
}
