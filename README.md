# AI Job Match Assistant

AI-ассистент для анализа соответствия резюме и вакансии. Строится как портфолио-проект для позиции ML/LLM Engineer в hh.ru AI Lab.

**Три режима:**
- **Анализ 1:1** — загрузи резюме + вакансию → получи детальный разбор пробелов и карьерный совет
- **Поиск работы** — загрузи резюме → система ищет вакансии на hh.ru и ранжирует по совпадению
- **HR** — загрузи вакансию + несколько резюме → таблица кандидатов с решением Hire/Borderline/No Hire

**Стек:** FastAPI · LangGraph · LangChain · Qdrant · PostgreSQL · React 19 · Vite · Zustand · Playwright

---

## Требования

- Python 3.11+
- Node.js 22+
- Docker + Docker Compose
- [Ollama](https://ollama.ai) (для локального LLM) **или** OpenAI API key

---

## Запуск

### 1. Клонировать и настроить окружение

```bash
git clone https://github.com/nik1999777/ai-job-match-assistant.git
cd ai-job-match-assistant

# Python окружение
python3 -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Playwright браузер (для парсинга hh.ru)
playwright install chromium
```

### 2. Настроить `.env`

```bash
cp .env.example .env   # если есть, иначе создай вручную
```

Минимальный `.env`:

```env
# Выбери провайдер: openai или ollama
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# Или локально через Ollama:
# LLM_PROVIDER=ollama
# OLLAMA_BASE_URL=http://localhost:11434
# OLLAMA_MODEL=llama3

LLM_TEMPERATURE=0.0
RESUME_CONTEXT_LIMIT=4000
VACANCY_CONTEXT_LIMIT=2000

DATABASE_URL=postgresql+asyncpg://jobmatch:jobmatch@localhost:5433/jobmatch
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=vacancies
CORS_ORIGINS=["http://localhost:5173"]
```

### 3. Запустить инфраструктуру

```bash
docker-compose up -d postgres qdrant
```

### 4. Запустить backend

```bash
source .venv/bin/activate
uvicorn api.main:app --reload --port 8000
```

Swagger UI: http://localhost:8000/docs

### 5. Запустить frontend

```bash
cd frontend
npm install
npm run dev
```

Приложение: http://localhost:5173

---

## Ollama (локальный LLM)

```bash
# Установить и запустить
brew install ollama
ollama serve

# Скачать модель
ollama pull llama3
```

---

## Наполнить Qdrant вакансиями (опционально)

RAG-поиск похожих вакансий работает только после индексации.  
Требует запущенного docker-compose и подключения к hh.ru.

```bash
source .venv/bin/activate

# ~500 вакансий ML/AI (~40 мин)
python -m scripts.index_vacancies

# Кастомные запросы
python -m scripts.index_vacancies --query "Python Backend" --query "FastAPI" --pages 3
```

---

## Eval pipeline

Измеряет качество системы на 6 тестовых парах резюме/вакансий.

```bash
source .venv/bin/activate

# Offline метрики (Rouge-L, skill recall, match score) — без LLM, бесплатно
python -m eval.run_eval

# + LLM-as-a-judge через GPT-4o-mini (требует OPENAI_API_KEY)
python -m eval.run_eval --judge
```

Результаты сохраняются в `eval/results/eval_YYYY-MM-DD.jsonl`.

---

## Структура проекта

```
ai-job-match-assistant/
├── api/                    ← FastAPI backend
│   ├── agents/             ← LangGraph пайплайн (parse → gap → advise)
│   ├── clients/            ← hh.ru клиент, Playwright pool, PDF парсер
│   ├── llm/                ← провайдер (OpenAI / Ollama), SSE streaming
│   ├── ml/                 ← BERT NER (навыки) + DistilBERT (seniority)
│   ├── rag/                ← Qdrant hybrid search (dense + sparse BM42)
│   ├── routes/             ← /analyze, /seek, /batch, /parse-resume, /fetch-vacancy
│   └── db/                 ← PostgreSQL модели (SQLAlchemy async)
├── frontend/               ← React 19 + Vite + Zustand + TanStack Query
├── eval/                   ← LLM-as-a-judge + offline метрики
├── ml/                     ← скрипты обучения (LoRA, NER fine-tuning)
├── scripts/                ← CLI: индексация вакансий hh.ru → Qdrant
├── docker-compose.yml      ← PostgreSQL + Qdrant
├── requirements.txt
└── ARCHITECTURE.md         ← подробная архитектура системы
```

Подробная документация:
- [ARCHITECTURE.md](ARCHITECTURE.md) — архитектура, поток данных, ключевые решения
- [api/BACKEND.md](api/BACKEND.md) — backend слой (FastAPI, LangGraph, БД)
- [frontend/FRONTEND.md](frontend/FRONTEND.md) — frontend (React, Zustand, SSE)
- [eval/EVAL.md](eval/EVAL.md) — eval pipeline (метрики, LLM-judge)
- [ml/ML.md](ml/ML.md) — ML обучение (NER, LoRA)
