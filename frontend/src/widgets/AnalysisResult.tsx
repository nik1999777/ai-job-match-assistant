import ReactMarkdown from 'react-markdown'
import { Separator } from '../components/ui/separator'
import { PipelineProgress } from '../components/PipelineProgress'
import { MatchScore } from '../components/MatchScore'
import { SkillBadges } from '../components/SkillBadges'
import { PipelineInspector } from '../components/PipelineInspector'
import { useAnalysisStore } from '../store/analysisStore'

export function AnalysisResult() {
  const state = useAnalysisStore()

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

  return (
    <div className="flex flex-col gap-6">
      <PipelineProgress
        currentNode={state.currentNode}
        completedNodes={state.completedNodes}
      />

      {(state.matchScore != null || state.seniority) && (
        <>
          <Separator />
          <MatchScore matchScore={state.matchScore} seniority={state.seniority} />
          <SkillBadges found={state.skillsFound} missing={state.skillsMissing} />
        </>
      )}

      {state.tokens && (
        <>
          <Separator />
          <div className="prose prose-sm max-w-none text-foreground">
            <ReactMarkdown>{state.tokens}</ReactMarkdown>
          </div>
        </>
      )}

      <PipelineInspector
        parsedData={state.parsedData}
        gapData={state.gapData}
        rawResume={state.rawResume}
        rawVacancy={state.rawVacancy}
      />
    </div>
  )
}
