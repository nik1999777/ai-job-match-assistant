# Frontend — Архитектура

---

## Стек

| | |
|---|---|
| **Vite + React 18** | bundler + UI |
| **TypeScript** | типизация |
| **TailwindCSS** | стили |
| **react-markdown** | рендер Markdown совета от LLM |

---

## UI — что видит пользователь

```
┌─────────────────────────────────────────────────────────────┐
│                   AI Job Match Assistant                    │
│                                                             │
│  [textarea: резюме]          [input: hh.ru URL]             │
│                   [Анализировать →]                         │
│                                                             │
│  ○ parse  →  ○ gap  →  ⏳ advise...   ← статус пайплайна   │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────────┐  │
│  │  40%     │  │  Middle  │  │ ✅ python   ❌ langchain  │  │
│  │  Match   │  │  87% уверен│ ✅ pytorch  ❌ qdrant      │  │
│  └──────────┘  └──────────┘  └──────────────────────────┘  │
│                                                             │
│  ## Overall Assessment                                      │
│  Your match score is 40%... ▌  ← LLM стримит токены        │
└─────────────────────────────────────────────────────────────┘
```

---

## Структура файлов

```
frontend/
├── package.json
├── vite.config.ts       ← proxy /api → localhost:8000
├── tsconfig.json
│
└── src/
    ├── main.tsx
    ├── App.tsx           ← собирает все компоненты
    │
    ├── types/
    │   └── analysis.ts  ← TypeScript интерфейсы для API
    │
    ├── hooks/
    │   └── useAnalysis.ts  ← SSE чтение + весь state (ключевой файл)
    │
    └── components/
        ├── AnalyzeForm.tsx     ← textarea + input + кнопка
        ├── PipelineStatus.tsx  ← ✅/⏳/○ для каждого узла
        ├── ResultCards.tsx     ← score, seniority, skills
        └── AdviceStream.tsx    ← Markdown рендер стримящегося текста
```

---

## Ключевой файл — `useAnalysis.ts`

Хук управляет всем: SSE соединением, состоянием, обновлением UI.

```typescript
// Что хранится в state:
interface AnalysisState {
  status: 'idle' | 'loading' | 'done' | 'error'
  currentNode: string | null    // какой узел сейчас работает
  completedNodes: string[]      // уже завершённые
  result: FinalState | null     // финальные данные (score, skills, ...)
  advice: string                // накапливается токен за токеном
}

// Как читается SSE поток:
async function analyze(resume: string, vacancyUrl: string) {
  const response = await fetch('/api/analyze', { method: 'POST', body: ... })
  const reader = response.body!.getReader()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    // Парсим события
    const lines = decode(value).split('\n').filter(l => l.startsWith('data: '))
    for (const line of lines) {
      const event = JSON.parse(line.slice(6))
      // node_start → обновить currentNode
      // node_done  → переместить в completedNodes
      // token      → добавить к advice (пользователь видит текст в реальном времени)
      // done       → записать финальный result
    }
  }
}
```

---

## API контракт (что ожидаем от бека)

**Запрос:**
```typescript
interface AnalyzeRequest {
  resume: string
  vacancy_url?: string   // hh.ru URL или ID вакансии
  vacancy?: string       // или сырой текст
  mode?: 'seeker' | 'hr'
}
```

**SSE события:**
```typescript
type SSEEvent =
  | { event: 'node_start'; node: string }
  | { event: 'node_done';  node: string }
  | { event: 'token';      content: string }
  | { event: 'done';       state: FinalState }

interface FinalState {
  match_score: number           // 0.0 – 1.0
  seniority: string             // junior | middle | senior
  seniority_confidence: number  // 0.0 – 1.0
  skills_found: string[]
  skills_missing: string[]
  llm_response: string          // полный Markdown текст совета
}
```

---

## Запуск

```bash
cd frontend
npm create vite@latest . -- --template react-ts
npm install react-markdown tailwindcss @tailwindcss/vite
npm run dev   # → http://localhost:5173
```

`vite.config.ts` — proxy чтобы не было CORS при разработке:
```typescript
server: { proxy: { '/api': 'http://localhost:8000' } }
```
