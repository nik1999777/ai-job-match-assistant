# Frontend — React + Vite

> Это знакомая тебе территория — ты JS разработчик.
> Этот файл описывает что именно строим и почему.

---

## 1. Что строим

```
┌─────────────────────────────────────────────────────────────┐
│                   AI Job Match Assistant                    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  RESUME                        VACANCY              │   │
│  │  ┌─────────────────────┐  ┌───────────────────────┐ │   │
│  │  │ Paste your resume   │  │ hh.ru URL or text     │ │   │
│  │  │                     │  │                       │ │   │
│  │  │ [textarea]          │  │ [input]               │ │   │
│  │  └─────────────────────┘  └───────────────────────┘ │   │
│  │                                                     │   │
│  │                    [Analyze →]                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  PIPELINE STATUS (появляется сразу после отправки)          │
│  ✅ parse   ✅ gap   ⏳ advise...                           │
│                                                             │
│  RESULTS (заполняются после gap_node)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐   │
│  │ Match Score  │  │  Seniority   │  │ Skills Gap     │   │
│  │    40%       │  │   Middle     │  │ ✅ python       │   │
│  │  [прогресс]  │  │    87%       │  │ ✅ pytorch      │   │
│  └──────────────┘  └──────────────┘  │ ❌ langchain    │   │
│                                      │ ❌ qdrant       │   │
│  ADVICE (стримится токен за токеном) └────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ## Overall Assessment                               │   │
│  │ Your match score is 40%. The main gap is...▌        │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Стек

| Инструмент | Зачем |
|---|---|
| **Vite** | bundler + dev server (быстрее CRA) |
| **React 18** | UI компоненты |
| **TypeScript** | типизация — ты знаешь |
| **TailwindCSS** | стили без CSS файлов |
| **react-markdown** | рендерит Markdown совет от LLM |

---

## 3. Структура файлов

```
frontend/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
│
└── src/
    ├── main.tsx                ← точка входа (ReactDOM.render)
    ├── App.tsx                 ← корневой компонент
    │
    ├── components/
    │   ├── AnalyzeForm.tsx     ← форма: textarea + input + кнопка
    │   ├── PipelineStatus.tsx  ← прогресс узлов parse → gap → advise
    │   ├── ResultCards.tsx     ← score, seniority, skills found/missing
    │   └── AdviceStream.tsx    ← Markdown рендер стримящегося текста
    │
    ├── hooks/
    │   └── useAnalysis.ts      ← вся логика SSE + состояние
    │
    └── types/
        └── analysis.ts         ← TypeScript интерфейсы
```

---

## 4. TypeScript типы — `src/types/analysis.ts`

```typescript
// Запрос к нашему API
export interface AnalyzeRequest {
  resume: string
  vacancy_url?: string   // hh.ru URL или ID
  vacancy?: string       // или сырой текст
  mode?: 'seeker' | 'hr'
}

// Одно SSE событие (приходит много раз пока соединение открыто)
export interface SSEEvent {
  event: 'node_start' | 'node_done' | 'token' | 'done'
  node?: string      // для node_start / node_done
  content?: string   // для token
  state?: FinalState // только для done
}

// Финальное состояние — приходит в последнем событии done
export interface FinalState {
  match_score: number
  seniority: 'junior' | 'middle' | 'senior' | 'unknown'
  seniority_confidence: number
  skills_found: string[]
  skills_missing: string[]
  llm_response: string
}
```

---

## 5. Главный хук — `src/hooks/useAnalysis.ts`

Это самая важная часть фронта. Вся логика SSE здесь.

```typescript
import { useState } from 'react'
import type { FinalState, SSEEvent } from '../types/analysis'

interface AnalysisState {
  status: 'idle' | 'loading' | 'done' | 'error'
  currentNode: string | null   // какой узел сейчас работает
  completedNodes: string[]     // какие уже завершились
  result: FinalState | null    // финальные данные
  advice: string               // накапливается токен за токеном
  error: string | null
}

export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>({
    status: 'idle',
    currentNode: null,
    completedNodes: [],
    result: null,
    advice: '',
    error: null,
  })

  async function analyze(resume: string, vacancyUrl: string) {
    // Сбрасываем состояние перед новым запросом
    setState({
      status: 'loading',
      currentNode: null,
      completedNodes: [],
      result: null,
      advice: '',
      error: null,
    })

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume, vacancy_url: vacancyUrl }),
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      if (!response.body) throw new Error('No response body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      // Читаем поток пока сервер не закроет соединение
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // Декодируем bytes → string
        const text = decoder.decode(value)

        // SSE формат: каждая строка начинается с "data: "
        // В одном chunk может прийти несколько событий
        const lines = text.split('\n').filter(l => l.startsWith('data: '))

        for (const line of lines) {
          const event: SSEEvent = JSON.parse(line.slice(6)) // убираем "data: "

          switch (event.event) {
            case 'node_start':
              setState(prev => ({ ...prev, currentNode: event.node ?? null }))
              break

            case 'node_done':
              setState(prev => ({
                ...prev,
                currentNode: null,
                completedNodes: [...prev.completedNodes, event.node ?? ''],
              }))
              break

            case 'token':
              // Каждый токен добавляем — пользователь видит текст как он пишется
              setState(prev => ({ ...prev, advice: prev.advice + (event.content ?? '') }))
              break

            case 'done':
              setState(prev => ({
                ...prev,
                status: 'done',
                result: event.state ?? null,
              }))
              break
          }
        }
      }
    } catch (err) {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      }))
    }
  }

  return { state, analyze }
}
```

---

## 6. Компоненты

### AnalyzeForm.tsx
```typescript
interface Props {
  onSubmit: (resume: string, vacancyUrl: string) => void
  loading: boolean
}

export function AnalyzeForm({ onSubmit, loading }: Props) {
  const [resume, setResume] = useState('')
  const [vacancyUrl, setVacancyUrl] = useState('')

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(resume, vacancyUrl) }}
          className="flex flex-col gap-4">

      <textarea
        value={resume}
        onChange={e => setResume(e.target.value)}
        placeholder="Вставьте текст вашего резюме..."
        rows={12}
        className="w-full p-3 border rounded-lg font-mono text-sm resize-y"
        required
      />

      <input
        value={vacancyUrl}
        onChange={e => setVacancyUrl(e.target.value)}
        placeholder="https://hh.ru/vacancy/123456789"
        className="w-full p-3 border rounded-lg"
        required
      />

      <button
        type="submit"
        disabled={loading}
        className="px-6 py-3 bg-blue-600 text-white rounded-lg disabled:opacity-50"
      >
        {loading ? 'Анализируем...' : 'Анализировать →'}
      </button>
    </form>
  )
}
```

### PipelineStatus.tsx
```typescript
const NODES = ['parse_node', 'gap_node', 'advise_node']
const LABELS: Record<string, string> = {
  parse_node: 'Парсинг',
  gap_node: 'Анализ навыков',
  advise_node: 'Генерация совета',
}

interface Props {
  currentNode: string | null
  completedNodes: string[]
}

export function PipelineStatus({ currentNode, completedNodes }: Props) {
  return (
    <div className="flex gap-6 items-center py-3">
      {NODES.map((node, i) => {
        const done = completedNodes.includes(node)
        const active = currentNode === node
        return (
          <div key={node} className="flex items-center gap-2">
            <span className={active ? 'animate-spin' : ''}>
              {done ? '✅' : active ? '⏳' : '○'}
            </span>
            <span className={active ? 'font-semibold' : done ? 'text-gray-500' : 'text-gray-300'}>
              {LABELS[node]}
            </span>
            {i < NODES.length - 1 && <span className="text-gray-300 ml-2">→</span>}
          </div>
        )
      })}
    </div>
  )
}
```

### ResultCards.tsx
```typescript
import type { FinalState } from '../types/analysis'

export function ResultCards({ result }: { result: FinalState }) {
  return (
    <div className="grid grid-cols-3 gap-4">

      {/* Match Score */}
      <div className="p-4 border rounded-lg text-center">
        <div className="text-3xl font-bold text-blue-600">
          {Math.round(result.match_score * 100)}%
        </div>
        <div className="text-sm text-gray-500 mt-1">Совпадение</div>
        <div className="mt-2 h-2 bg-gray-200 rounded-full">
          <div
            className="h-2 bg-blue-600 rounded-full transition-all"
            style={{ width: `${result.match_score * 100}%` }}
          />
        </div>
      </div>

      {/* Seniority */}
      <div className="p-4 border rounded-lg text-center">
        <div className="text-3xl font-bold text-purple-600 capitalize">
          {result.seniority}
        </div>
        <div className="text-sm text-gray-500 mt-1">
          Уровень · {Math.round(result.seniority_confidence * 100)}% уверенность
        </div>
      </div>

      {/* Skills */}
      <div className="p-4 border rounded-lg">
        <div className="text-sm font-semibold mb-2">Навыки</div>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {result.skills_found.map(s => (
            <div key={s} className="text-sm text-green-600">✅ {s}</div>
          ))}
          {result.skills_missing.map(s => (
            <div key={s} className="text-sm text-red-500">❌ {s}</div>
          ))}
        </div>
      </div>

    </div>
  )
}
```

### AdviceStream.tsx
```typescript
import ReactMarkdown from 'react-markdown'

interface Props {
  content: string
  streaming: boolean
}

export function AdviceStream({ content, streaming }: Props) {
  if (!content) return null
  return (
    <div className="p-4 border rounded-lg">
      <div className="prose max-w-none">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
      {/* Мигающий курсор пока LLM стримит */}
      {streaming && <span className="animate-pulse text-gray-400">▌</span>}
    </div>
  )
}
```

### App.tsx — собираем всё
```typescript
import { useAnalysis } from './hooks/useAnalysis'
import { AnalyzeForm } from './components/AnalyzeForm'
import { PipelineStatus } from './components/PipelineStatus'
import { ResultCards } from './components/ResultCards'
import { AdviceStream } from './components/AdviceStream'

export default function App() {
  const { state, analyze } = useAnalysis()

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">AI Job Match Assistant</h1>

      <AnalyzeForm
        onSubmit={analyze}
        loading={state.status === 'loading'}
      />

      {state.status !== 'idle' && (
        <PipelineStatus
          currentNode={state.currentNode}
          completedNodes={state.completedNodes}
        />
      )}

      {state.result && (
        <ResultCards result={state.result} />
      )}

      {state.advice && (
        <AdviceStream
          content={state.advice}
          streaming={state.status === 'loading'}
        />
      )}

      {state.error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
          {state.error}
        </div>
      )}
    </div>
  )
}
```

---

## 7. vite.config.ts — proxy к беку

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Все запросы /api/* → http://localhost:8000/api/*
      // Это убирает CORS проблемы в разработке
      '/api': 'http://localhost:8000',
    }
  }
})
```

---

## 8. Как создать и запустить

```bash
# Создать проект
npm create vite@latest frontend -- --template react-ts
cd frontend

# Установить зависимости
npm install
npm install react-markdown tailwindcss @tailwindcss/vite @tailwindcss/typography

# Запустить (пока бек работает на :8000)
npm run dev
# → http://localhost:5173
```

---

## 9. Порядок реализации фронта (Неделя 3)

```
1. npm create vite  — скаффолд (5 мин)
2. types/analysis.ts — TypeScript типы (10 мин)
3. hooks/useAnalysis.ts — SSE логика (30 мин, ключевой файл)
4. AnalyzeForm.tsx — форма (20 мин)
5. PipelineStatus.tsx — прогресс (15 мин)
6. ResultCards.tsx — карточки (20 мин)
7. AdviceStream.tsx — Markdown стрим (15 мин)
8. App.tsx — сборка (15 мин)
9. Tailwind стили (30 мин)
```
