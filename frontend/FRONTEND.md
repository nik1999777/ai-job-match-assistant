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
│   │                             callback(text, fileId | null) — текст + UUID файла на диске
│   │                             file_id передаётся в /api/analyze → сохраняется в Analysis → скачивается из истории
│   ├── useBatchAnalyze.ts     ← хук для POST /api/batch (HR режим, шлёт Authorization header)
│   ├── useSeekVacancies.ts   ← SSE хук для POST /api/seek (шлёт Authorization header)
│   └── useHistory.ts         ← хуки для всех типов истории:
│                                 useHistory(page, mode?) — анализы с фильтром по режиму
│                                 useBatchHistory/useBatchDetail/useDeleteBatchSession
│                                 useSeekHistory/useSeekDetail/useDeleteSeekSession
│                                 AnalysisDetail.resume_file_id — UUID оригинального PDF (для скачивания)
│                                 AnalysisDetail.vacancy_url — URL вакансии hh.ru (для ссылки в истории)
│
├── components/
│   ├── ui/                    ← shadcn компоненты
│   ├── AppHeader.tsx          ← единый sticky хедер для всех режимов
│   │                             tabs зависят от роли:
│   │                               seeker → [Анализ резюме] [Поиск работы]
│   │                               hr     → [Оценка кандидата] [Скрининг резюме]
│   │                             user dropdown: аватар + email + История + Sign out
│   │                             История — в меню (Vercel/Linear pattern), не в основной nav
│   ├── PdfFileCard.tsx        ← карточка загруженного PDF: иконка + имя файла (ссылка) + ✓ + "Изменить"
│   │                             без предпросмотра текста — PDF кликабелен для просмотра
│   ├── TextContentCard.tsx    ← карточка загруженного/введённого текста: иконка + метка + кол-во симв. + ✓
│   │                             опциональный onEdit (карандаш-иконка) → возврат к вводу
│   │                             используется в BatchForm после fetch вакансии
│   ├── confirm-dialog.tsx     ← модальное окно подтверждения удаления
│   ├── PipelineProgress.tsx   ← прогресс узлов (parse → gap → advise)
│   ├── MatchScore.tsx         ← процент совпадения + progress bar
│   ├── SkillBadges.tsx        ← зелёные (found) и красные (missing) badges
│   ├── AdviceCard.tsx         ← рендер структурированного совета (SeekerAdvice | HRAdvice)
│   │                             isSeekerAdvice() type guard; AdviceSkeleton пока advise_node работает
│   │                             SeekerView: overall → top_skills badges → resume_tips → strategy
│   │                             HRView: candidate_fit → strengths/gaps (2 col) → decision chip
│   └── SimilarVacancies.tsx   ← RAG top-3 похожих вакансий + skill benchmark
│                                  список: title + company + salary + ↗ ссылка + score%
│                                  benchmark: bar chart частоты навыков; красный = missing (✗)
│
├── widgets/
│   ├── AnalyzeForm.tsx        ← форма: резюме (PDF-only дропзона) + вакансия (URL input)
│   │                             Резюме: дропзона → upload → PdfFileCard с "Изменить"
│   │                             Вакансия: URL input + "Открыть вакансию ↗" ссылка под полем
│   │                             Нет вкладок "Текст/PDF" или "URL/Текст" — только нужные input'ы
│   │                             resume_file_id передаётся в POST /api/analyze (для скачивания из истории)
│   ├── AnalysisResult.tsx     ← результат анализа, читает analysisStore
│   │                             SimilarVacancies блок (между SkillBadges и AdviceCard)
│   │                             AdviceSkeleton пока currentNode === 'advise_node'
│   ├── BatchForm.tsx          ← HR форма: вакансия (URL auto-fetch on blur) + multi-PDF upload
│   │                             вакансия: URL → onBlur → fetch /api/fetch-vacancy → TextContentCard
│   │                             нет кнопки "Загрузить" — fetch запускается автоматически при уходе с поля
│   │                             резюме: drag & drop (multiple PDF), каждый → clickable link + статус
│   │                             получает onAnalyze/onReset/loading/done как props (state поднят в HRBatchPage)
│   ├── CandidateTable.tsx     ← таблица кандидатов: rank, score, decision, навыки
│   ├── SeekForm.tsx           ← форма поиска: резюме (PDF-only дропзона) + фильтры
│   │                             Резюме: дропзона → PdfFileCard (нет вкладки "Текст")
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
│   ├── HRBatchPage.tsx        ← лейаут HR batch: форма слева, CandidateTable справа (grid cols-2)
│   ├── JobSeekPage.tsx        ← лейаут: SeekForm слева, VacancyResultList справа
│   ├── HistoryPage.tsx        ← роль-зависимые табы истории:
│   │                             seeker: "Анализ резюме" | "Поиск работы"
│   │                             hr:     "Оценка кандидата" | "Скрининг резюме"
│   │                             удаление с ConfirmDialog (модальное подтверждение)
│   ├── AnalysisDetailPage.tsx ← детальный просмотр одного анализа
│   │                             вверху хедера: "↗ Открыть вакансию" + "⬇ Скачать резюме" (PDF)
│   │                             ScoreRing + badges + дата; навыки; SimilarVacancies; AdviceCard
│   │                             parseAdvice(): JSON → AdviceCard, fallback → plain text (старые записи)
│   │                             "Скачать резюме": fetch GET /api/resumes/{file_id} + Bearer → blob → resume.pdf
│   │                             кнопка скачивания скрыта если resume_file_id == null (старые записи)
│   ├── BatchDetailPage.tsx    ← детальный просмотр скрининга: ранжированный список кандидатов
│   │                             rank, decision, score, found/missing skills, explanation
│   │                             нет блока с текстом вакансии (убран)
│   └── SeekDetailPage.tsx     ← детальный просмотр поиска: карточки вакансий
│                                 rank, title, company, salary, score, decision, skills
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
HR пользователи видят: `[Оценка кандидата] [Скрининг резюме]`

**Анализ** (AnalysisPage):
```
┌──────────────────────────┬──────────────────────────────────┐
│  Резюме                  │  ○ Parsing resume & vacancy      │
│  [ ↑ drag & drop PDF ]   │  ○ Analyzing skill gaps          │
│  📄 resume.pdf ✓  [✎]    │  ⏳ Generating advice...         │
│                          │  Match: 40%  [python✓] [rag✗]   │
│  Вакансия                │  ## Overall Assessment...        │
│  https://hh.ru/vacancy/… │  ▶ Pipeline Inspector            │
│  ↗ Открыть вакансию      │                                  │
│  [Анализировать →]       │                                  │
└──────────────────────────┴──────────────────────────────────┘
```

**Поиск работы** (JobSeekPage):
```
┌──────────────────────────┬──────────────────────────────────┐
│  Резюме                  │  ● Анализируем резюме…           │
│  [ ↑ drag & drop PDF ]   │  Скиллы: FastAPI PostgreSQL ...  │
│  📄 resume.pdf ✓  [✎]    │                                  │
│  Должность: Python Dev   │  #1 Python Developer · Домклик  │
│  Город: [Москва ▼]       │      [████████░░] 75% Сильный    │
│  Опыт:  [3-6 лет ▼]      │      ✓ FastAPI  ✗ Kafka          │
│  З/п от: 150000          │      [Показать анализ]           │
│  [x] Удалённо            │                                  │
│  Кол-во: [10 ▼]          │  #2 Backend Engineer · Яндекс   │
│  [Найти вакансии →]      │      [██████░░░░] 60% Стоит...   │
└──────────────────────────┴──────────────────────────────────┘
```

**HR batch** (HRBatchPage):
```
┌─────────────────────────────────────────────────────────────┐
│  Вакансия                                                   │
│  https://hh.ru/vacancy/…  (уходит с поля → auto-fetch)     │
│  📄 Вакансия загружена ✓ [✎]   1234 симв.                   │
│                                                             │
│  Резюме кандидатов (PDF)                                    │
│  [ ↑ drag & drop, несколько PDF ]                           │
│  ✓ candidate1.pdf   ✓ candidate2.pdf                        │
│  [Анализировать 2 кандидатов]                               │
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

  ↗ Открыть вакансию   ⬇ Скачать резюме        ← ссылки/кнопки вверху, нет сырых текстов
  ●●●●○ 40%  middle  [Borderline]  conf 87%
  2026-05-21

  Совпадающие навыки: Python FastAPI
  Пропущенные навыки: Kafka Kubernetes

  ## Overall Assessment...
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
