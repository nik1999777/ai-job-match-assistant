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
│                                Authorization: Bearer token + mode из getRole()
│
├── store/
│   ├── analysisStore.ts      ← Zustand store для режима "Анализ"
│   ├── authStore.ts          ← Zustand persist: token, userId, email, role
│   │                             getToken() / getRole() — утилиты вне React (для streaming.ts)
│   └── seekStore.ts          ← Zustand store для режима "Поиск работы"
│                                 (status, statusMessage, resumeSkills, results[])
│                                 addResult сразу сортирует по match_score DESC
│
├── hooks/
│   ├── useAuth.ts             ← useLogin, useRegister (TanStack Query mutations)
│   │                             onSuccess → authStore.login(token, userId, email, role)
│   ├── useAnalyze.ts          ← useMutation (TanStack Query) + callbacks в analysisStore
│   ├── useUploadResume.ts     ← обёртка над orval-хуком для PDF upload
│   ├── useBatchAnalyze.ts     ← хук для POST /api/batch (HR режим)
│   └── useSeekVacancies.ts   ← SSE хук для POST /api/seek
│                                 читает поток событий: resume_parsed → search_done
│                                 → result (×N) → done
│
├── components/
│   ├── ui/                    ← shadcn компоненты
│   ├── AppHeader.tsx          ← единый sticky хедер для всех режимов
│   │                             tabs зависят от роли:
│   │                               seeker → [Анализ] [Поиск работы]
│   │                               hr     → [Анализ] [HR]
│   │                             user dropdown: аватар + email + История + Sign out
│   │                             История — в меню (Vercel/Linear pattern), не в основной nav
│   ├── PipelineProgress.tsx   ← прогресс узлов (parse → gap → advise)
│   ├── MatchScore.tsx         ← процент совпадения + progress bar
│   ├── SkillBadges.tsx        ← зелёные (found) и красные (missing) badges
│   └── PipelineInspector.tsx  ← коллапс-блок: raw inputs + узлы + LLM промпт
│
├── widgets/
│   ├── AnalyzeForm.tsx        ← форма: резюме (Текст / PDF) + вакансия (URL / Текст)
│   │                             PDF: после загрузки имя файла — кликабельная ссылка
│   ├── AnalysisResult.tsx     ← результат анализа, читает analysisStore
│   ├── BatchForm.tsx          ← HR форма: вакансия + multi-PDF upload
│   ├── CandidateTable.tsx     ← таблица кандидатов: rank, score, decision, навыки
│   ├── SeekForm.tsx           ← форма поиска: резюме (Текст / PDF) + фильтры
│   │                             PDF: после загрузки имя файла — кликабельная ссылка
│   │                             job_title, area (Москва/СПб/Россия),
│   │                             experience, salary_from, remote, count (5/10/15/20)
│   └── VacancyResultList.tsx  ← карточки вакансий появляются по мере анализа
│                                 каждая: rank, title, company, salary, score bar,
│                                 decision badge, found/missing skills, expand→advice
│
├── pages/
│   ├── AuthPage.tsx           ← форма входа/регистрации
│   │                             tabs: Войти / Регистрация
│   │                             role picker (только на регистрации): Соискатель | HR
│   │                             карточки с SVG иконками, selected = border-foreground bg-accent
│   ├── AnalysisPage.tsx       ← лейаут: форма слева, результат справа (seeker)
│   ├── HRBatchPage.tsx        ← лейаут HR batch анализа (full-height scroll)
│   ├── JobSeekPage.tsx        ← лейаут: SeekForm слева, VacancyResultList справа
│   ├── HistoryPage.tsx        ← список анализов текущего пользователя
│   │                             клик на карточку → AnalysisDetailPage
│   │                             кнопка удаления с e.stopPropagation()
│   └── AnalysisDetailPage.tsx ← детальный просмотр одного анализа
│                                 ScoreRing, DecisionBadge, навыки, LLM advice, raw texts
│
├── app/
│   └── App.tsx                ← QueryClientProvider + auth guard + роутинг по AppMode
│                                 если нет токена → AuthPage
│                                 иначе → AppHeader + {mode}-страница
│                                 'seeker'  → AnalysisPage
│                                 'search'  → JobSeekPage
│                                 'hr'      → HRBatchPage
│                                 'history' → HistoryPage
│
├── lib/utils.ts               ← cn() утилита от shadcn
└── index.css                  ← Tailwind v4 + shadcn переменные
```

---

## State Management

### Почему Zustand + TanStack Query, а не useState?

SSE стриминг плохо ложится в TanStack Query (он для request-response). Разделение:

- **Zustand** — хранит streaming state (токены, parsedData, gapData, прогресс узлов) + auth state
- **TanStack Query `useMutation`** — управляет lifecycle запросов (pending, error, reset)

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

useLogin / useRegister (hooks/useAuth.ts)
  └── useMutation
        mutationFn → POST /api/auth/login|register
        onSuccess  → authStore.login(token, userId, email, role)
```

**authStore** — Zustand с `persist` middleware (localStorage, ключ `'auth'`):
```typescript
// Вне React компонентов (для streaming.ts)
getToken() → useAuthStore.getState().token
getRole()  → useAuthStore.getState().role ?? 'seeker'
```
`streaming.ts` использует `getToken()` для Authorization header и `getRole()` для параметра `mode` — без React hooks, без prop drilling.

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

## Режим "Поиск работы" (seek)

```
useSeekVacancies.ts
  └── fetch('/api/seek', { method: 'POST', body: filters })
        читает SSE поток:
          resume_parsed → seekStore.setResumeParsed(skills, seniority)
          search_done   → seekStore.setSearchDone(total, query)
          result        → seekStore.addResult(vacancy)  ← сортировка по score внутри
          done          → seekStore.setDone()
          error         → seekStore.setError()

seekStore.ts
  addResult: (result) => set((s) => ({
    results: [...s.results, result].sort((a, b) => b.match_score - a.match_score)
    //      ↑ real-time сортировка — каждая новая карточка встаёт на своё место
  }))
```

**VacancyResultList** — карточки потоком:
- Пока `status === 'loading'`: пульсирующий статус (Анализируем резюме… → Ищем вакансии… → Анализируем N вакансий…)
- Карточки появляются по одной по мере готовности и сразу сортируются
- Decision labels (для seekers): `strong_match` / `worth_considering` / `weak_match`
- Score bar: зелёный ≥75%, жёлтый ≥50%, серый <50%
- `[Показать анализ]` → expand с полным текстом advice от LLM

## Pipeline Inspector

Коллапсируемый блок в нижней части результата. Показывает:

1. **Raw Inputs** — полный текст резюме и вакансии (с expand для длинных)
2. **parse_node output** — что LLM извлёк: summary, навыки, seniority hint
3. **gap_node output** — skill matching, ML seniority, похожие вакансии из Qdrant
4. **advise_node prompt** — реконструированный промпт, который отправился в LLM

Появляется сразу после parse_node, не ждёт конца анализа.

---

## UI — что видит пользователь

**Авторизация** (AuthPage):
```
┌─────────────────────────┐
│  AI Job Match           │
│  С возвращением         │
│                         │
│  [Войти] [Регистрация]  │
│                         │
│  Email: ___________     │
│  Пароль: __________     │
│  [Войти →]              │
│                         │
│  (на регистрации:)      │
│  [🔍 Соискатель] [HR]   │  ← role picker с иконками
└─────────────────────────┘
```

**Хедер** (AppHeader, общий для всех режимов после авторизации):
```
AI Job Match   [Анализ] [Поиск работы]         [N]▾   ← аватар (initial) + dropdown
                                                         ├ История анализов
                                                         └ Sign out
```
HR пользователи видят: `[Анализ] [HR]` вместо `[Поиск работы]`

**Анализ** (AnalysisPage):
```
┌──────────────────────────┬──────────────────────────────────┐
│  Резюме                  │  ○ Parsing resume & vacancy      │
│  [Текст][PDF]            │  ○ Analyzing skill gaps          │
│  Вакансия                │  ⏳ Generating advice...         │
│  [URL hh.ru][Текст]      │  Match: 40%  [python✓] [rag✗]   │
│  [Анализировать →]       │  ## Overall Assessment...        │
│                          │  ▶ Pipeline Inspector            │
└──────────────────────────┴──────────────────────────────────┘
```

**Поиск работы** (JobSeekPage):
```
┌──────────────────────────┬──────────────────────────────────┐
│  Резюме [Текст][PDF]     │  ● Анализируем резюме…           │
│  Должность: Python Dev   │  Скиллы: FastAPI PostgreSQL ...  │
│  Город: [Москва ▼]       │                                  │
│  Опыт:  [3-6 лет ▼]      │  #1 Python Developer · Домклик  │
│  З/п от: 150000          │      [████████░░] 75% Сильный    │
│  [x] Удалённо            │      ✓ FastAPI  ✗ Kafka          │
│  Кол-во: [10 ▼]          │      [Показать анализ]           │
│                          │                                  │
│  [Найти вакансии →]      │  #2 Backend Engineer · Яндекс   │
│                          │      [██████░░░░] 60% Стоит...   │
└──────────────────────────┴──────────────────────────────────┘
```

**HR batch** (HRBatchPage):
```
┌─────────────────────────────────────────────────────────────┐
│  Вакансия [URL][Текст]   Резюме PDF (drag & drop, ×N)       │
│  [Загрузить]             candidate1.pdf ✓  candidate2.pdf ✓ │
│                          (имена файлов — кликабельные ссылки)│
│  [Анализировать 3 кандидатов]                               │
│  ────────────────────────────────────────────────────────── │
│  #  Имя              Score  Decision     Навыки             │
│  1  candidate2.pdf   85%    [Hire]       Python FastAPI ...  │
│  2  candidate1.pdf   60%    [Borderline] Python             │
└─────────────────────────────────────────────────────────────┘
```

**История анализов** (HistoryPage → AnalysisDetailPage):
```
История анализов                           [← Назад]

  vacancy: ML Engineer · Яндекс    40%  middle   2026-05-21  [🗑]
  vacancy: Python Developer         75%  senior   2026-05-20  [🗑]

  ↓ клик на карточку

  ML Engineer · Яндекс
  ●●●●○ 40%  middle  [Borderline]

  Совпадающие навыки: Python FastAPI
  Пропущенные навыки: Kafka Kubernetes

  ## Overall Assessment...
  ▼ Резюме (исходный текст)
  ▼ Вакансия (исходный текст)
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
