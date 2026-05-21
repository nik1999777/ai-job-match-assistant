import { SeekForm } from '../widgets/SeekForm'
import { VacancyResultList } from '../widgets/VacancyResultList'

export function JobSeekPage() {
  return (
    <main className="grid grid-cols-1 md:grid-cols-2 h-full">
      <div className="border-r p-6 overflow-y-auto">
        <SeekForm />
      </div>
      <div className="p-6 overflow-y-auto">
        <VacancyResultList />
      </div>
    </main>
  )
}
