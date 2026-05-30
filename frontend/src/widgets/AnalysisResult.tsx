import { Separator } from '../components/ui/separator'
import { PipelineProgress } from '../components/PipelineProgress'
import { MatchScore } from '../components/MatchScore'
import { SkillBadges } from '../components/SkillBadges'
import { SimilarVacancies } from '../components/SimilarVacancies'
import { AdviceCard, AdviceSkeleton } from '../components/AdviceCard'
import { useAnalysisStore } from '../store/analysisStore'

export function AnalysisResult() {
  const state = useAnalysisStore()

  if (state.status === 'idle') {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Заполните форму и нажмите «Анализировать»
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

  const advisePending = state.currentNode === 'advise_node'

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

      {state.gapData && state.gapData.similar_vacancies.length > 0 && (
        <>
          <Separator />
          <SimilarVacancies
            vacancies={state.gapData.similar_vacancies}
            missingSkills={state.skillsMissing}
          />
        </>
      )}

      {(state.adviceData || advisePending) && (
        <>
          <Separator />
          {advisePending
            ? <AdviceSkeleton />
            : state.adviceData && <AdviceCard data={state.adviceData} />
          }
        </>
      )}

    </div>
  )
}
