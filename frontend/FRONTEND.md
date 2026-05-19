# Frontend — Архитектура

---

## Стек

| | |
|---|---|
| **Vite 8 + React 19** | bundler + UI |
| **TypeScript 6** | типизация |
| **Tailwind CSS v4** | стили (через @tailwindcss/vite плагин) |
| **shadcn/ui** | компоненты (Button, Textarea, Badge, Progress, Separator) |
| **Zustand 5** | streaming state (токены, parsedData, gapData) |
| **TanStack Query 5** | server mutations (PDF upload, analyze) |
| **Orval 8** | codegen TypeScript типов + хуков из OpenAPI |
| **react-markdown** | рендер Markdown совета от LLM |
| **lucide-react** | иконки |
| **Node.js 22** | требуется для Vite 8 |

---

## Структура

```
src/
├── api/
│   ├── generated.ts          ← orval codegen из FastAPI OpenAPI (не редактировать вручную)
│   └── streaming.ts          ← SSE логика: читает поток /api/analyze, вызывает callbacks
│
├── store/
│   └── analysisStore.ts      ← Zustand store: весь streaming state + actions
│
├── hooks/
│   ├── useAnalyze.ts         ← useMutation (TanStack Query) + callbacks в Zustand store
│   └── useUploadResume.ts    ← обёртка над orval-хуком useParseResumeApiParseResumePost
│
├── components/
│   ├── ui/                   ← shadcn компоненты
│   ├── PipelineProgress.tsx  ← прогресс узлов (parse → gap → advise)
│   ├── MatchScore.tsx        ← процент совпадения + progress bar
│   ├── SkillBadges.tsx       ← зелёные (found) и красные (missing) badges
│   └── PipelineInspector.tsx ← коллапс-блок: raw inputs + каждый узел + LLM промпт
│
├── widgets/
│   ├── AnalyzeForm.tsx       ← форма: резюме (3 таба) + вакансия (2 таба) + кнопка
│   └── AnalysisResult.tsx    ← собирает компоненты, читает Zustand store напрямую
│
├── pages/
│   └── AnalysisPage.tsx      ← лейаут: форма слева, результат справа
│
├── app/
│   └── App.tsx               ← QueryClientProvider + AnalysisPage
│
├── lib/utils.ts              ← cn() утилита от shadcn
└── index.css                 ← Tailwind v4 + shadcn переменные
```

---

## State Management

### Почему Zustand + TanStack Query, а не useState?

SSE стриминг плохо ложится в TanStack Query (он для request-response). Разделение:

- **Zustand** — хранит streaming state (токены, parsedData, gapData, прогресс узлов)
- **TanStack Query `useMutation`** — управляет lifecycle запроса (pending, error, reset)

```
useAnalyze.ts
  └── useMutation
        mutationFn → streamAnalyze(params, store callbacks)
        onMutate  → store.setLoading()
        onError   → store.setError()

streamAnalyze (api/streaming.ts)
  └── читает SSE поток
        → store.setCurrentNode()
        → store.addCompletedNode()
        → store.addToken()
        → store.setParsedData()
        → store.setGapData()
        → store.setDone()
```

### Почему компоненты читают Zustand напрямую?

Нет prop drilling: `AnalysisResult` и `AnalyzeForm` не получают state пропом — они сами подписаны на нужные срезы стора. `AnalysisPage` — чистый лейаут без state.

---

## API Codegen (Orval)

```bash
# Регенерировать при изменении FastAPI эндпоинтов (нужен запущенный бэкенд):
curl -s http://localhost:8000/openapi.json > openapi.json
npm run generate-api   # требует Node.js 22
```

Orval читает `openapi.json` → генерирует `src/api/generated.ts`:
- TypeScript интерфейсы для всех request/response тел
- TanStack Query мутации для каждого эндпоинта
- `/api/analyze` исключён из codegen (SSE, не стандартный JSON response)

Ключевые сгенерированные сущности:
```typescript
AnalyzeRequest            // тело POST /api/analyze
BodyParseResumeApiParseResumePost  // { file: Blob }
useParseResumeApiParseResumePost   // TanStack Query мутация для PDF upload
```

---

## Vite Proxy

В dev-режиме Vite проксирует `/api/*` и `/health` на `localhost:8000`.  
Поэтому `generated.ts` использует относительные пути — без хардкода порта.

```ts
// vite.config.ts
server: {
  proxy: {
    '/api': 'http://localhost:8000',
    '/health': 'http://localhost:8000',
  }
}
```

В production — то же самое делает nginx.

---

## SSE события (`api/streaming.ts`)

```typescript
// Бэкенд шлёт 6 типов событий:
{ event: "node_start",   node: "parse_node" }
{ event: "parsed_data",  data: ParsedData, raw_resume: string, raw_vacancy: string }
{ event: "node_done",    node: "parse_node" }

{ event: "node_start",   node: "gap_node" }
{ event: "gap_data",     skills_found, skills_missing, match_score, seniority, similar_vacancies }
{ event: "node_done",    node: "gap_node" }

{ event: "node_start",   node: "advise_node" }
{ event: "token",        content: "## Overall" }  // стримятся только из advise_node
{ event: "node_done",    node: "advise_node" }

{ event: "done",         state: { ...финальный стейт } }
```

`parsed_data` и `gap_data` — дополнительные события (добавлены для Pipeline Inspector).  
Позволяют показывать данные каждого узла сразу после его завершения.

---

## Pipeline Inspector

Коллапсируемый блок в нижней части результата. Показывает:

1. **Raw Inputs** — полный текст резюме и вакансии (с expand для длинных)
2. **parse_node output** — что LLM извлёк: summary, навыки, seniority hint
3. **gap_node output** — skill matching, ML seniority, похожие вакансии из Qdrant
4. **advise_node prompt** — реконструированный промпт, который отправился в LLM

Появляется сразу после parse_node, не ждёт конца анализа.

---

## UI — что видит пользователь

```
┌─────────────────────────────────────────────────────────────┐
│              AI Job Match Assistant                         │
├──────────────────────────┬──────────────────────────────────┤
│  Резюме                  │  ○ Parsing resume & vacancy      │
│  [Текст][hh.ru][PDF]     │  ○ Analyzing skill gaps          │
│  textarea / url / drop   │  ⏳ Generating advice...         │
│                          │                                  │
│  Вакансия                │  Match: 40% ████░░               │
│  [URL hh/LinkedIn][Текст]│  [middle] [python✓] [rag✗]       │
│  https://hh.ru/vacancy/… │                                  │
│                          │  ## Overall Assessment           │
│  [Анализировать →]       │  Your profile matches 40%...     │
│                          │                                  │
│                          │  ▶ Pipeline Inspector            │
└──────────────────────────┴──────────────────────────────────┘
```

---

## Запуск

```bash
# Требуется Node.js 22 (Vite 8 не поддерживает < 20.19)
nvm use 22

cd frontend
npm install
npm run dev          # http://localhost:5173

# Регенерировать API типы (при запущенном бэкенде):
npm run generate-api
```

Бэкенд должен работать на `localhost:8000`. В dev Vite проксирует запросы автоматически.
