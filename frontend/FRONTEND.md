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
│   │   └── AnalyzeForm.tsx            ← форма: резюме + URL + кнопка
│   └── AnalysisResult/ui/
│       └── AnalysisResult.tsx         ← прогресс узлов + score + markdown
│
├── features/
│   └── analyze/
│       ├── api/useAnalyze.ts          ← SSE хук: fetch → читает stream
│       └── model/types.ts             ← типы: AnalysisState, NodeName
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
│  textarea: резюме        │  ○ Parsing resume & vacancy      │
│                          │  ○ Analyzing skill gaps          │
│                          │  ⏳ Generating advice...         │
│  input: hh.ru URL        │                                  │
│                          │  Match: 40% ████░░               │
│  [Analyze match →]       │  [middle] [python✓] [rag✗]       │
│                          │                                  │
│                          │  ## Overall Assessment           │
│                          │  Your profile matches 40%...     │
└──────────────────────────┴──────────────────────────────────┘
```

---

## SSE хук (`features/analyze/api/useAnalyze.ts`)

JS аналогия: как `fetch` + `ReadableStream`, но с парсингом SSE строк.

```typescript
// Поток событий от бэкенда:
data: {"event": "node_start", "node": "parse_node"}
data: {"event": "node_done",  "node": "parse_node"}
data: {"event": "token",      "content": "## Overall"}
data: {"event": "done",       "state": {...финальный стейт...}}
```

Хук читает поток через `resp.body.getReader()`, парсит каждую строку и обновляет `AnalysisState` через `useState`. Компоненты реагируют реактивно.

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
