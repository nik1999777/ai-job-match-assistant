# Frontend — Архитектура

---

## Стек

| | |
|---|---|
| **Vite 8 + React 19** | bundler + UI |
| **TypeScript 6** | типизация |
| **Tailwind CSS v4** | стили (через @tailwindcss/vite плагин) |
| **shadcn/ui** | компоненты (Button, Textarea, Badge, Progress, Separator) |
| **react-markdown** | рендер Markdown совета от LLM |
| **lucide-react** | иконки |
| **Node.js 22** | требуется для Vite 8 |

---

## Структура (Feature-Sliced Design)

```
src/
├── app/
│   └── App.tsx                        ← корневой компонент
│
├── pages/
│   └── analysis/ui/
│       └── AnalysisPage.tsx           ← страница: форма + результат рядом
│
├── widgets/
│   ├── AnalyzeForm/ui/
│   │   └── AnalyzeForm.tsx            ← форма: резюме (ResumeInput) +
│   │                                     вакансия (URL/текст табы) + кнопка
│   └── AnalysisResult/ui/
│       └── AnalysisResult.tsx         ← прогресс узлов + score + markdown
│
├── features/
│   └── analyze/
│       ├── api/useAnalyze.ts          ← SSE хук: params object API
│       │                                 {resume, resumeUrl, vacancyUrl, vacancyText}
│       ├── model/types.ts             ← типы: AnalysisState, NodeName
│       └── ui/
│           └── ResumeInput.tsx        ← 3-tab компонент: текст / hh.ru / PDF
│                                         PDF: POST /api/parse-resume → получает текст
│
├── components/ui/                     ← shadcn компоненты (авто-генерация)
├── lib/utils.ts                       ← cn() утилита от shadcn
└── index.css                          ← Tailwind v4 + shadcn переменные
```

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
└──────────────────────────┴──────────────────────────────────┘
```

---

## SSE хук (`features/analyze/api/useAnalyze.ts`)

JS аналогия: как `fetch` + `ReadableStream`, но с парсингом SSE строк.

```typescript
// Вызов:
analyze({ resume, resumeUrl, vacancyUrl, vacancyText })
// resume + resumeUrl — взаимозаменяемы; аналогично vacancy/vacancyUrl

// Поток событий от бэкенда:
data: {"event": "node_start", "node": "parse_node"}
data: {"event": "node_done",  "node": "parse_node"}
data: {"event": "token",      "content": "## Overall"}  // только от advise_node
data: {"event": "done",       "state": {...финальный стейт...}}
```

Хук читает поток через `resp.body.getReader()`, парсит каждую строку и обновляет `AnalysisState` через `useState`.

## PDF Upload (`features/analyze/ui/ResumeInput.tsx`)

При выборе PDF: хук делает `POST /api/parse-resume` (multipart), получает `{text: "..."}` и кладёт текст в состояние. После этого нажатие «Анализировать» отправляет уже текст в основной `/api/analyze` — никаких изменений в API не требуется.

---

## Запуск

```bash
# Требуется Node.js 22 (Vite 8 не поддерживает < 20.19)
nvm use 22

cd frontend
npm install
npm run dev          # http://localhost:5173
```

Бэкенд должен работать на `localhost:8000` (CORS настроен на этот origin).
