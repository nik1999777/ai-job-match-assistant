import { Badge } from './ui/badge'

interface Props {
  found: string[]
  missing: string[]
}

export function SkillBadges({ found, missing }: Props) {
  if (!found.length && !missing.length) return null

  return (
    <div className="flex gap-2 flex-wrap">
      {found.map((s) => (
        <Badge key={s} variant="outline" className="text-green-600 border-green-300">{s}</Badge>
      ))}
      {missing.map((s) => (
        <Badge key={s} variant="outline" className="text-red-500 border-red-300">{s}</Badge>
      ))}
    </div>
  )
}
