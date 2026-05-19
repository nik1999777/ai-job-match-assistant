import { CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { NODE_LABELS, type NodeName } from '../store/analysisStore'

const NODE_ORDER: NodeName[] = ['parse_node', 'gap_node', 'advise_node']

interface Props {
  currentNode: NodeName | null
  completedNodes: NodeName[]
}

export function PipelineProgress({ currentNode, completedNodes }: Props) {
  return (
    <div className="flex flex-col gap-3">
      {NODE_ORDER.map((node) => {
        const done = completedNodes.includes(node)
        const active = currentNode === node
        return (
          <div key={node} className="flex items-center gap-3 text-sm">
            {done ? (
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            ) : active ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <span className={
              done ? 'text-foreground'
              : active ? 'text-primary font-medium'
              : 'text-muted-foreground'
            }>
              {NODE_LABELS[node]}
            </span>
          </div>
        )
      })}
    </div>
  )
}
