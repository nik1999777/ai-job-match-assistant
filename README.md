# AI Job Match Assistant

AI-ассистент для анализа соответствия резюме и вакансии. Строится как портфолио-проект для позиции ML/LLM Engineer в hh.ru AI Lab.

**Режимы (зависят от роли):**
- **Анализ резюме** — резюме + вакансия → детальный разбор пробелов и карьерный совет (seeker) / Hire/Borderline/No Hire (hr)
- **Поиск работы** — резюме + фильтры → поиск вакансий на hh.ru, ранжирование по совпадению _(только seeker)_
- **Скрининг резюме** — вакансия + до 20 резюме → таблица кандидатов с решением _(только hr)_
- **История** — роль-зависимые вкладки: seeker видит "Анализ резюме" + "Поиск работы", hr — "Оценка кандидата" + "Скрининг резюме". Удаление с модальным подтверждением
- **Авторизация** — email+пароль, роль seeker или hr при регистрации. Роль определяет вкладки и режим агента

**Стек:** FastAPI · LangGraph · LangChain · Qdrant · PostgreSQL · React 19 · Vite · Zustand · Playwright

---

## ⚡ Быстрый запуск (dev)

```bash
# 1. Инфраструктура (PostgreSQL + Qdrant + Langfuse)
docker compose up -d postgres qdrant langfuse

# 2. Backend
source .venv/bin/activate
uvicorn api.main:app --port 8000

# 3. LLM
ollama serve   # модель задаётся в .env → OLLAMA_MODEL=llama3

# 4. Frontend
cd frontend && nvm use 22 && npm run dev

# 5. Eval + MLflow UI (опционально)
python -m eval.run_eval
mlflow ui --port 5001
```

| Сервис | URL | Назначение |
|--------|-----|-----------|
| **App** | http://localhost:5173 | React frontend |
| **API / Swagger** | http://localhost:8000/docs | FastAPI backend |
| **Langfuse** | http://localhost:3000 | LLM трейсинг (spans, scores, generations) |
| **Qdrant** | http://localhost:6333/dashboard | Векторная БД (RAG вакансии) |
| **MLflow** | http://localhost:5001 | Eval experiments, метрики |

> **Системный прокси:** если локальные сервисы (Qdrant, Ollama) недоступны — добавь `env -u HTTP_PROXY -u HTTPS_PROXY` перед `uvicorn`
>
> **LLM провайдеры** (выбрать в `.env`):
> - `LLM_PROVIDER=ollama` — локально, бесплатно (dev)
> - `LLM_PROVIDER=groq` + `GROQ_API_KEY=gsk_...` + `GROQ_PROXY=http://user:pass@host:port` — бесплатно, нужен прокси из РФ. Лимиты: [console.groq.com/dashboard](https://console.groq.com/dashboard)
> - `LLM_PROVIDER=openai` + `OPENAI_API_KEY=sk_...` — GPT-4o-mini (prod)

### Groq модели (бесплатный tier)

| GROQ_MODEL | Размер | Лимит/сутки | Качество | Примечание |
|---|---|---|---|---|
| `meta-llama/llama-4-scout-17b-16e-instruct` | 17B MoE | ~500K TPD | ★★★★☆ | **рекомендуется** — лучший eval |
| `llama-3.3-70b-versatile` | 70B | 100K TPD | ★★★★★ | умнее, но маленькая квота |
| `llama-3.1-8b-instant` | 8B | 500K TPD | ★★★☆☆ | быстрый fallback |
| `qwen/qwen3-32b` | 32B | ~100K TPD | ★★★★☆ | Alibaba, сильный reasoning |

Каждая модель имеет **отдельную** квоту — если одна исчерпана, переключись на другую. Смена: `GROQ_MODEL=<model-id>` в `.env`. Квоты сбрасываются в полночь UTC.

Полный список + eval результаты → [.env.example](.env.example)

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

# JWT auth
JWT_SECRET=your-secret-key-here
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=10080
```

### 3. Запустить инфраструктуру

```bash
# Минимум: PostgreSQL + Qdrant
docker-compose up -d postgres qdrant

# + Langfuse (LLM трейсинг)
docker-compose up -d postgres qdrant langfuse
# Открыть http://localhost:3000 → зарегистрироваться → Settings → API Keys → вставить в .env
```

### 4. Применить миграции и запустить backend

```bash
source .venv/bin/activate

# Применить Alembic миграции (создаёт users + добавляет role)
alembic upgrade head

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

# Offline метрики (skill recall/precision/F1, Rouge-L, latency) — без LLM, бесплатно
python -m eval.run_eval

# + LLM-as-a-judge через GPT-4o-mini (требует OPENAI_API_KEY)
python -m eval.run_eval --judge
```

Результаты сохраняются в `eval/results/eval_YYYY-MM-DD.jsonl` и логируются в MLflow.  
При каждом запуске показывается regression comparison vs предыдущий прогон (↑ улучшение / ↓ регрессия).

---

## Observability

| Инструмент | Порт | Назначение |
|---|---|---|
| **Langfuse** | 3000 | Production LLM трейсинг: spans по нодам, Generations (LLM вызовы), Scores, Sessions |
| **MLflow** | 5001 | Eval experiment tracking: история прогонов, сравнение метрик |

```bash
# Langfuse (через docker-compose)
docker-compose up -d langfuse
# → http://localhost:3000

# MLflow UI (без docker)
mlflow ui --port 5001
# → http://localhost:5001
```

---

## Структура проекта

```
ai-job-match-assistant/
├── api/                    ← FastAPI backend
│   ├── agents/             ← LangGraph пайплайн (parse → gap → advise)
│   ├── auth/               ← JWT auth (bcrypt + python-jose), Depends
│   ├── clients/            ← hh.ru клиент, Playwright pool, PDF парсер
│   ├── llm/                ← провайдер (OpenAI / Ollama), SSE streaming
│   ├── ml/                 ← BERT NER (навыки) + DistilBERT (seniority)
│   ├── rag/                ← Qdrant hybrid search (dense + sparse BM42)
│   ├── routes/             ← /auth, /analyze, /seek, /batch, /history, /analyses, /batch-history, /seek-history
│   └── db/                 ← PostgreSQL модели (SQLAlchemy async)
├── alembic/                ← миграции БД (async Alembic)
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
