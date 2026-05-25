# AI Job Match Assistant — Архитектура

> Подробная документация по каждому слою — в своей папке:
> - [api/BACKEND.md](api/BACKEND.md) — FastAPI, LangGraph, база данных, hh.ru клиент
> - [frontend/FRONTEND.md](frontend/FRONTEND.md) — React, SSE хук, компоненты
> - [ml/ML.md](ml/ML.md) — обучение BERT NER и DistilBERT+LoRA
> - [eval/EVAL.md](eval/EVAL.md) — LLM-as-a-judge, offline метрики

---

## 1. Покрытие требований hh.ru AI Lab

| Требование | Реализация в проекте | Файл |
|---|---|---|
| LLM-based решения: агенты, RAG, fine-tuning | LangGraph агент (3 узла) + Qdrant RAG + PEFT/LoRA | `api/agents/`, `api/rag/`, `api/ml/` |
| LangChain / LangGraph | StateGraph с TypedDict-стейтом | `api/agents/graph.py` |
| Structured output | `with_structured_output(ParsedData)` — Pydantic-схема → function calling (OpenAI) / JSON mode (Ollama) | `api/agents/nodes/parse.py` |
| Context engineering | Многосекционный промпт в advise-узле | `api/agents/nodes/advise.py` |
| LLM-as-a-judge, offline-метрики | Eval pipeline с Rouge + LLM-судья | `eval/` |
| PyTorch + HuggingFace + PEFT | NER skill extractor + LoRA seniority clf + BAAI/bge semantic skill matching | `api/ml/` |
| FastAPI + asyncio, высоконагруженный сервис | Async API, SSE streaming, batch endpoint | `api/routes/` |
| PostgreSQL + SQLAlchemy | Async ORM, Session + Analysis модели | `api/db/models.py` |
| Векторные БД (Qdrant) | Гибридный поиск (dense + sparse BM42) | `api/rag/` |
| Мониторинг реальной работы ассистентов | Langfuse (LLM трейсинг, per-node spans, Generations, Scores, Sessions) + MLflow (eval experiment tracking) | `api/llm/streaming.py`, `eval/` |
| Инференс open-source LLM | Ollama-провайдер (llama3.2) | `api/llm/provider.py` |

---

## 2. Общая схема системы

```
┌─────────────────────────────────────────────────────────────────┐
│                         КЛИЕНТ (3 режима + auth)                │
│     React 19 + Vite 8 + Zustand + TanStack Query + Orval        │
│                                                                 │
│  [Анализ резюме]   resume + vacancy → SSE анализ (seeker/hr mode)  │
│  [Поиск работы]   resume + фильтры → N вакансий → ranked results  │
│  [Скрининг резюме] 1 vacancy + N резюме → batch ranking (hr only)  │
│  [История]        роль-зависимые табы + удаление с подтверждением  │
│  [Авторизация]    email+password, role: seeker|hr                  │
└─────────┬──────────────────┬──────────────────┬────────────────┘
          │ POST /api/analyze │ POST /api/seek   │ POST /api/batch
          │ SSE               │ SSE              │ JSON
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FASTAPI (port 8000)                          │
│                                                                 │
│  /api/auth/register → email+password+role → JWT                │
│  /api/auth/login    → email+password → JWT                     │
│  /api/analyze   → резюме + вакансия + mode → LangGraph → SSE   │
│  /api/seek      → резюме + фильтры → поиск → N×LangGraph → SSE │
│  /api/batch     → вакансия + N резюме → asyncio.gather → JSON  │
│  /api/history        → список анализов (mode filter, JWT required)│
│  /api/analyses/{id}    → детали + удаление (JWT required)         │
│  /api/batch-history    → история скринингов (JWT required)        │
│  /api/batch-history/{id} → детали + удаление (JWT required)       │
│  /api/seek-history     → история поисков (JWT required)           │
│  /api/seek-history/{id}  → детали + удаление (JWT required)       │
│  /api/parse-resume → PDF upload → PyMuPDF → текст              │
│  /api/fetch-vacancy → URL → текст вакансии                     │
│  /health        → healthcheck                                   │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│              LANGGRAPH АГЕНТ (StateGraph)                       │
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐   │
│  │  parse_node  │──▶│   gap_node   │──▶│   advise_node    │   │
│  └──────────────┘   └──────────────┘   └──────────────────┘   │
│         │                  │                     │             │
│  LLM: структурный    ML: NER (BERT)        LLM: генерация     │
│  парсинг в JSON      RAG: похожие          совета по 4         │
│                      вакансии              секциям             │
│                      ML: seniority clf                         │
└──────┬──────────────────┬──────────────────────────────────────┘
       │                  │
       ▼                  ▼
┌─────────────┐   ┌──────────────────────────────────────────────┐
│ LLM Layer   │   │              ML + RAG Layer                  │
│             │   │                                              │
│  OpenAI     │   │  SkillExtractor     SeniorityClassifier      │
│  GPT-4o-mini│   │  (BERT NER)         (DistilBERT + LoRA)      │
│  Claude     │   │                      junior/mid/senior       │
│  (prod)     │   │  SkillMatcher                                │
│     OR      │   │  exact match +      Qdrant Retriever         │
│  Ollama     │   │  BAAI/bge cosine    hybrid search            │
│  llama3     │   │  similarity         top-k vacancies          │
│  (dev only) │   │                                              │
│  Streaming  │   │  LanguageDetector   Qdrant Indexer           │
│  via SSE    │   │  Cyrillic ratio     dense(BAAI)+sparse(BM42) │
│             │   └──────────────────────────────────────────────┘
└─────────────┘
       │                  │
       └──────┬───────────┘
              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ИНФРАСТРУКТУРА (Docker)                      │
│                                                                 │
│   PostgreSQL :5432    Qdrant :6333    (Ollama :11434 optional)  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Поток данных шаг за шагом

### Шаг 1 — HTTP запрос

```
POST /api/analyze
{
  "resume": "Опыт: 3 года Python, FastAPI...",   // текст резюме

  // вакансия: один из вариантов
  "vacancy_url": "https://hh.ru/vacancy/12345",   // hh.ru URL
  "vacancy":     "Требуется ML Engineer...",       // или просто текст

  "mode": "seeker"
}
```

**Что происходит в `api/routes/analyze.py`:**
1. Берётся текст резюме
2. Резолвится вакансия: URL → официальный hh.ru API + Playwright fallback; или текст
3. Создаётся `Session` (mode="seeker") — сохраняется в PostgreSQL
4. Создаётся `Analysis` (resume_text, vacancy_text) — FK на Session
5. Строится LangGraph граф через `build_graph()`
6. Запускается `event_stream(graph, resume, vacancy)` — асинхронный генератор
7. Возвращается `StreamingResponse` с `media_type="text/event-stream"`

### Шаг 2 — parse_node (LLM структурный парсинг)

**Файл:** `api/agents/nodes/parse.py`

```
Вход:  state = {"resume": "...", "vacancy": "...", "mode": "seeker"}
Выход: state + {"parsed": {
    "resume_summary": "Senior Python developer...",
    "vacancy_summary": "ML Engineer at hh.ru AI Lab...",
    "resume_skills": ["Python", "FastAPI", "PyTorch"],    ← нормализованные
    "vacancy_skills": ["LangChain", "Qdrant", "PyTorch"], ← без версий
    "vacancy_seniority_hint": "senior"
}}
```

**Structured output через `with_structured_output(ParsedData)`:**
- Pydantic-модель `ParsedData` с `Field(description=...)` — инструкция нормализации прямо в схеме
- OpenAI: использует function calling → 100% гарантия схемы
- `langchain-ollama` ChatOllama: JSON mode → мягкая гарантия
- `Field(description=...)` явно инструктирует: нормализация (`'react-router' → 'React'`), разбивка составных скиллов (`'TypeScript + React' → ['TypeScript', 'React']`), убирает версии, исключает скиллы в процессе изучения (`'изучаю', 'learning'`), для OR-условий берёт первый вариант (`'GitLab или GitHub Actions' → ['GitLab']`)

**Зачем LLM, а не regex?** Навыки и разделители пишутся по-разному в каждом резюме на любом языке. Regex с захардкоженными словами ("or", "и", "или") ломается при смене языка или формата — LLM нормализует контекстно.

### Шаг 3 — gap_node (ML + RAG анализ)

**Файл:** `api/agents/nodes/gap.py`

```
Вход:  state со всем выше
Выход: state + {
    "skills_found":  ["python", "pytorch"],        # пересечение
    "skills_missing": ["langchain", "qdrant"],      # vacancy \ resume
    "match_score": 0.4,                            # |found| / |vacancy|
    "seniority": "middle",                         # DistilBERT + LoRA
    "seniority_confidence": 0.87,
    "similar_vacancies": [                         # Qdrant top-3
        {"title": "ML Engineer", "skills": ["pytorch", ...]}
    ]
}
```

**Четыре действия gap_node:**

```
parse_node.resume_skills ──► merge_skills() ──► resume_skills
NER(resume text)         ──►    (supplement)

parse_node.vacancy_skills ──► merge_skills() ──► vacancy_skills
NER(vacancy text)          ──►   (supplement)

resume_skills + vacancy_skills ──► match_skills() ──► found, missing, score
  Stage 1: exact normalized match (C++ → c++, GitLab CI → gitlabci)
  Stage 2: cosine similarity via BAAI/bge-small (Postgres ≈ PostgreSQL, LoRA ≈ fine-tuning)

resume text ──► SeniorityClassifier (xlm-roberta) ──► seniority

vacancy text ──► Qdrant hybrid search ──► top-3 похожих вакансий

vacancy text ──► auto-index (fire-and-forget) ──► Qdrant upsert
```

**Auto-indexing:** каждый раз когда пользователь анализирует вакансию, она автоматически добавляется в Qdrant через `asyncio.create_task()`. База знаний растёт из реального использования и покрывает любые специализации.

### Шаг 4 — advise_node (LLM генерация совета)

**Файл:** `api/agents/nodes/advise.py`

`detect_language(resume)` → `"Russian"` или `"English"` → передаётся в промпт как `{language}`.  
Языковая детекция по доле Cyrillic символов (>15% → Russian) — работает надёжнее чем "respond in the same language".

Два промпта — выбор по `state["mode"]`:

**mode=seeker** (`_SEEKER_PROMPT`) — карьерный совет:
- **Overall Assessment** — общая оценка совместимости
- **Top Skills to Develop** — 3 самых важных навыка + как учить
- **Resume Improvements** — конкретные правки в резюме
- **Application Strategy** — как позиционировать кандидатуру

**mode=hr** (`_HR_PROMPT`) — оценка кандидата:
- **Candidate Fit** — 1-2 предложения об общей совместимости
- **Strengths** — совпадающие навыки и релевантный опыт
- **Gaps** — чего не хватает для роли
- **Hiring Recommendation** — **Hire** / **Borderline** / **No Hire** + обоснование

**Почему финальный шаг через LLM?** Предыдущие узлы дали структурированные данные (числа, списки). LLM на последнем шаге генерирует связный human-readable текст.

### Шаг 5 — SSE Streaming

**Файл:** `api/llm/streaming.py`

LangGraph транслирует события через `astream_events(version="v2")`.  
Мы фильтруем нужные и шлём клиенту:

```
data: {"event": "node_start",  "node": "parse_node"}
data: {"event": "parsed_data", "data": {...}, "raw_resume": "...", "raw_vacancy": "..."}
data: {"event": "node_done",   "node": "parse_node"}

data: {"event": "node_start",  "node": "gap_node"}
data: {"event": "gap_data",    "skills_found": [...], "skills_missing": [...],
                               "match_score": 0.4, "seniority": "middle",
                               "similar_vacancies": [...]}
data: {"event": "node_done",   "node": "gap_node"}

data: {"event": "node_start",  "node": "advise_node"}
data: {"event": "token",       "content": "## Overall"}   ← LLM стримит
data: {"event": "token",       "content": " Assessment"}
...
data: {"event": "node_done",   "node": "advise_node"}

data: {"event": "done",        "state": {...финальный стейт...}}
```

Клиент рендерит прогресс в реальном времени — видно, что сейчас делает система.

---

## 4. Детали каждого компонента

### 4.1 LLM Provider (`api/llm/provider.py`)

```python
# Паттерн: абстракция провайдера
get_llm()  →  ChatOpenAI(gpt-4o-mini)      # если LLM_PROVIDER=openai
           →  ChatOllama(llama3)            # если LLM_PROVIDER=ollama
```

**Зачем два провайдера?**
- **OpenAI / Claude** — production (GPT-4o-mini / claude-sonnet): качество, нативный structured output, промпты написаны под этот уровень
- **Ollama** — только для локальной разработки (без интернета, нулевые затраты). В prod не используется.

Оба реализуют `BaseChatModel` из LangChain — остальной код не меняется.

**Настройка через `.env`:**
- `LLM_TEMPERATURE=0.0` — детерминированные ответы (обязательно для eval); через `settings.llm_temperature`
- `RESUME_CONTEXT_LIMIT` / `VACANCY_CONTEXT_LIMIT` — лимиты контекста под конкретную модель (llama3=4000/2000, gpt-4o=20000/8000, claude=50000/20000)

**Важно:** Ollama использует пакет `langchain-ollama` (не `langchain_community`).  
`langchain-ollama` — официальная актуальная интеграция с поддержкой `with_structured_output`.  
`langchain_community.ChatOllama` — устаревшая версия, `with_structured_output` не реализован.

### 4.2 LangGraph граф (`api/agents/graph.py`)

```python
# StateGraph с типизированным состоянием
class JobMatchState(TypedDict, total=False):
    resume: str
    vacancy: str
    parsed: dict          # после parse_node
    skills_found: list    # после gap_node
    skills_missing: list  # после gap_node
    match_score: float    # после gap_node
    seniority: str        # после gap_node
    similar_vacancies: list  # после gap_node
    llm_response: str     # после advise_node
```

**Почему LangGraph, а не просто функции?**
- Явный граф зависимостей (что за чем)
- Встроенный checkpoint / resume при сбое
- `astream_events` — бесплатный стриминг событий каждого узла
- Легко добавить ветвления (conditional edges) — например, разный путь для HR vs соискатель

### 4.3 База данных (`api/db/models.py`)

```
PostgreSQL
├── users
│   ├── id (int, PK, autoincrement)
│   ├── email (str, unique)
│   ├── password_hash (str)
│   ├── role ("seeker" | "hr")
│   └── created_at
│
├── sessions
│   ├── id (UUID, PK)
│   ├── user_id (FK → users, nullable — для неавторизованных)
│   ├── mode ("seeker" | "hr")
│   └── created_at
│
├── analyses
│   ├── id (int, PK)
│   ├── session_id (FK → sessions)
│   ├── resume_text, vacancy_text
│   ├── match_score, seniority, seniority_confidence
│   ├── skills_found, skills_missing (JSON string)
│   ├── llm_response, decision
│   └── created_at
│
├── batch_sessions                    ← история скрининга (HR batch)
│   ├── id (int, PK)
│   ├── user_id (FK → users, nullable)
│   ├── vacancy_text
│   ├── candidate_count (int)
│   ├── results (JSON Text — массив CandidateResult)
│   └── created_at
│
└── seek_sessions                     ← история поиска работы
    ├── id (int, PK)
    ├── user_id (FK → users, nullable)
    ├── job_title (str — запрос)
    ├── result_count (int)
    ├── results (JSON Text — массив VacancyResult)
    └── created_at
```

**AsyncPG + SQLAlchemy async** — неблокирующие запросы к БД.  
Сессия создаётся до запуска графа, результаты записываются после завершения.

**Alembic** — управление миграциями (async engine с `run_sync(do_run_migrations)` паттерном).  
Миграция добавила `role` в `users` с `server_default='seeker'` для существующих строк.

### 4.4 ML Слой

#### `api/ml/skill_extractor.py` — NER на BERT (вспомогательный источник)
```
Задача: дополнить LLM-навыки теми, что LLM мог пропустить
Модель: dslim/bert-base-NER
Метод: pipeline("ner", aggregation_strategy="simple") — lazy load через @cache
Вход: первые 1800 символов текста (~450 BERT токенов)
Выход: слова из MISC + ORG entity групп (где живут tech-термины)
Фильтр: ## BERT subword-артефакты отфильтровываются (модель English-only → мусор на русском тексте)
Роль: supplement (не primary) — gap_node использует LLM-парсинг как основу
```

#### `api/ml/skill_matcher.py` — двухэтапное сопоставление навыков
```
Stage 1: exact normalized match
  _normalize(): stripws + [\s.\-_/] → C++ сохраняется, "GitLab CI/CD" → "gitlabcicd"
  Нулевая стоимость — embeddings не загружаются если всё совпало точно

Stage 2: cosine similarity via BAAI/bge-small-en-v1.5
  Для навыков без точного совпадения — матрица (V, R) одной векторизованной операцией
  Порог: settings.skill_match_threshold (default 0.75, настраивается через .env)
  Примеры: 'Postgres' ≈ 'PostgreSQL', 'LoRA' ≈ 'fine-tuning', 'GitLab CI' ≈ 'GitLab'

merge_skills(primary, supplement): LLM-список как основа, NER как дополнение, dedup по норме
match_skills(resume, vacancy) → (found, missing, score)
```

#### `api/ml/seniority_clf.py` — zero-shot классификация уровня
```
Задача: junior / middle / senior по тексту резюме
Модель: joeddav/xlm-roberta-large-xnli (multilingual NLI)
Метод: pipeline("zero-shot-classification") — lazy load через @cache
Вход: первые 600 символов резюме (сигнал уровня плотный в начале)
Выход: (label, confidence) — например ("middle", 0.82)
Multilingual: xlm-roberta работает с русским текстом hh.ru
Токенизатор: XLMRobertaTokenizer загружается явно — AutoTokenizer падает в transformers>=4.47
```

**Почему zero-shot сейчас, LoRA позже?** Zero-shot не требует датасета — работает сразу.  
Fine-tuning LoRA на реальных данных (ml/train_seniority.py) заменит его на Неделе 4.

**Почему LoRA потом?** Обучаем только rank-16 адаптер (~1% параметров) — в 100x быстрее full fine-tuning.  
Демонстрирует знание PEFT — прямое требование вакансии.

### 4.5 Поиск вакансий — `/api/seek` + VacancySearchProvider

**Файлы:** `api/routes/seek.py`, `api/clients/vacancy_search.py`

Новый режим "Поиск работы": пользователь вводит резюме и фильтры → система ищет подходящие вакансии и ранжирует их.

```
Резюме + фильтры (query, area, experience, salary, remote, count)
  │
  ▼ 1. parse_node (LLM) — извлекает skills + seniority из резюме
  │     если query пустой — auto-строит из топ-5 навыков
  ▼ 2. VacancySearchProvider.search(filters)
  │     ─ HHPlaywrightSearchProvider (сейчас): Playwright scrapes hh.ru search page
  │       → JS evaluate → извлекает id, title, company, address, exp из карточек
  │     ─ HHOAuthSearchProvider (будущее): api.hh.ru/vacancies с токеном
  ▼ 2.5 Enrich: get_vacancy(id) × N через официальный API (без auth)
  │     Семафор 5 параллельных запросов → полный текст + key_skills + salary
  │     Без enrich: match_score = 0% (карточка без требований)
  │     С enrich: реальный score на основе полного описания вакансии
  ▼ 3. asyncio.gather(run_graph × N) — полный LangGraph для каждой вакансии
  │     → run_graph (mode="seeker") → parse → gap → advise
  │     → asyncio.Queue: результаты стримятся по мере готовности
  ▼ 4. SSE → фронт: карточки появляются по одной, sorted by score
```

**Provider abstraction (Open/Closed principle):**
```python
class VacancySearchProvider(Protocol):
    async def search(self, filters: SearchFilters) -> list[VacancyItem]: ...

def get_search_provider() -> VacancySearchProvider:
    # меняется только здесь при подключении OAuth / LinkedIn
    return HHPlaywrightSearchProvider()
```
Весь остальной код (`seek.py`, фронт) не меняется при смене провайдера.

**Почему Playwright для поиска, а не `api.hh.ru/vacancies?text=...`?**  
Поиск `GET /vacancies?text=...` требует регистрации приложения hh.ru (возвращает 403 без токена).  
`GET /vacancies/{id}` работает без auth — но из-за rate limit при параллельных запросах тоже блокируется.  
Playwright открывает страницу поиска как браузер, JS evaluate достаёт структурированные данные из карточек.  
Один Playwright-сеанс на весь поиск — минимум overhead.

### 4.6 Слой данных — hh.ru (Playwright + API)

#### Откуда берутся данные

```
ИСТОЧНИКИ ДАННЫХ
├── Вакансии для RAG (знания системы)
│   └── scripts/index_vacancies.py
│       → Playwright: hh.ru/search/vacancy?text=ML+Engineer  (поиск)
│       → api.hh.ru/vacancies/{id}                           (детали)
│       → embed → Qdrant (200–500 вакансий, ~40 мин одноразово)
│
├── Конкретная вакансия для анализа (от пользователя)
│   ├── вариант A: пользователь вставляет текст
│   └── вариант B: hh.ru URL → api/clients/hh_client.py
│                              официальный API + Playwright fallback
│
└── Резюме пользователя
    ├── вариант A: пользователь вставляет текст
    └── вариант B: PDF upload → POST /api/parse-resume → PyMuPDF → текст
```

**Стратегия получения вакансий hh.ru:**
```
URL → extract_vacancy_id() → api.hh.ru/vacancies/{id}  ← официальный API (быстро, надёжно)
                           ↓ fallback если API вернул ошибку
                           → Playwright headless Chromium  ← bypass DDoS Guard
```
Официальный API работает для большинства публичных вакансий без авторизации.  
Playwright — fallback для случаев когда API недоступен.

#### `api/clients/browser_pool.py` — shared Playwright browser

```python
await browser_pool.start()     # в lifespan: один Chromium на весь сервер
await browser_pool.stop()      # graceful shutdown

async with get_page(user_agent=UA) as page:   # изолированный context на запрос
    await page.goto(url)
    ...
```

**Почему singleton, а не новый браузер на запрос?**  
Запуск Chromium занимает ~1-2 сек. При 10 параллельных seek-запросах это 10 браузеров → ~1GB RAM.  
Singleton: один браузер, каждый запрос получает изолированный `BrowserContext` (~50ms) — отдельные cookies, localStorage.  
Аналогия: `pg.Pool` вместо `pg.connect()` на каждый запрос.  
Fallback: если `browser_pool.start()` не вызван (тесты, скрипты) — автоматически эфемерный браузер.

#### `api/clients/hh_client.py` — клиент к hh.ru

```python
get_vacancy_by_url(url_or_id)  → (text, dict)  # API first, Playwright fallback
get_vacancy(vacancy_id)        → dict           # официальный API без auth
vacancy_to_text(data)          → str            # dict → plain text
```

Извлечение через Playwright — два уровня:
1. `<script type="application/ld+json">` с `@type: JobPosting` — Schema.org, самый надёжный
2. DOM fallback: `data-qa="vacancy-title"`, `data-qa="vacancy-description"`

#### `api/clients/resume_parser.py` — парсинг PDF резюме

```python
get_resume_from_pdf(bytes) → str   # PyMuPDF → структурированный текст
```

`get_text("blocks")` вместо `get_text()`:
- Возвращает блоки с координатами `(x0, y0, x1, y1, text)`
- Сортировка `(y // 20, x)` исправляет порядок в двухколоночных PDF
- Фильтрация шума: номера страниц (`"1"`, `"2 / 5"`), повторяющиеся шапки/подвалы

#### `api/rag/retriever.py` + `api/rag/indexer.py` — Qdrant hybrid search

```
Qdrant коллекция "vacancies"
├── dense  vector: BAAI/bge-small-en-v1.5 (384d, cosine)
│                  семантическое сходство ("ML" ≈ "machine learning")
└── sparse vector: BM42 (fastembed)
                   точный match терминов ("LangGraph", "LoRA")

Поиск = RRF(dense_top15, sparse_top15) → top-3

Почему RRF, а не взвешенная сумма?
  RRF не требует ручной настройки весов α и β.
  Хорошо работает "из коробки" — стандарт в production RAG системах.
```

Модели вынесены в `api/rag/embeddings.py` — единые синглтоны для indexer и retriever (не создаём дважды).

#### `scripts/index_vacancies.py` — опциональный cold-start CLI

Заполняет Qdrant до первых пользователей. После этого база растёт автоматически через auto-indexing в `gap_node`.

```bash
# Cold-start: 16 специализаций × 100 вакансий (~1600 вакансий, ~20 мин):
python -m scripts.index_vacancies --pages 1

# Больше вакансий (~4800, ~1 час):
python -m scripts.index_vacancies --pages 3

# Кастомные запросы:
python -m scripts.index_vacancies --query "Product Manager" --query "iOS разработчик" --pages 2
```

**16 дефолтных специализаций:** AI/ML, Python backend, Frontend, DevOps, Data Engineer, Data Analyst, Product Manager, Project Manager, UX Designer — универсальное покрытие рынка.

`upsert` идемпотентен — повторный запуск безопасен. `area=113` (вся Россия) + `no_magic=true` предотвращают гео-редирект. Пауза 2 сек между запросами (`--pause`).

### 4.6 Eval Pipeline

```
eval/
├── dataset.py        — 8 тестовых пар EvalCase: resume + vacancy + ground truth
├── metrics.py        — offline метрики без LLM: advice_similarity, Rouge-L, skill recall/precision/F1, MAE, latency
├── judge.py          — LLM-as-a-judge: GPT-4o-mini оценивает 4 критерия (1-5)
├── run_eval.py       — запуск прогона: latency, regression comparison, MLflow logging, JSONL
└── results/          — история прогонов (JSONL, один файл в день)
```

**Запуск:**
```bash
# offline метрики только (без LLM-вызовов, бесплатно)
python -m eval.run_eval

# + LLM-as-a-judge (требует OPENAI_API_KEY)
python -m eval.run_eval --judge
```

**Три уровня метрик:**

| Метрика | Что измеряет | Где |
|---|---|---|
| `match_score_in_range` | match_score попадает в ожидаемый диапазон | `metrics.py` |
| `match_score_mae` | среднее отклонение от ожидаемого диапазона | `metrics.py` |
| `skill_recall` | доля ожидаемых пробелов, которые система нашла (sensitivity) | `metrics.py` |
| `skill_precision` | доля верных предсказаний среди всех предсказанных (без ложных тревог) | `metrics.py` |
| `skill_f1` | гармоническое среднее recall и precision | `metrics.py` |
| `advice_similarity` | косинусное сходство эмбеддингов BAAI/bge — основная метрика качества совета | `metrics.py` |
| `rouge_l` | n-gram сходство текстов — вспомогательная | `metrics.py` |
| `latency_ms` | время выполнения pipeline на кейс | `metrics.py` |
| `judge_relevance/actionability/accuracy/faithfulness` | LLM-судья оценивает 1-5 по четырём критериям | `judge.py` |

**Что такое LLM-as-a-judge?**  
Вместо человека берём сильную модель (GPT-4o-mini) и просим оценить ответ нашей системы по критериям (relevance, actionability, accuracy, faithfulness 1-5).  
`faithfulness` — проверяет галлюцинации: всё ли сказанное LLM подкреплено текстами резюме и вакансии.  
Это стандартная практика в AI Lab для offline-мониторинга качества — дешевле human eval, коррелирует с ним.

**Regression comparison:**  
При каждом запуске runner автоматически загружает предыдущий JSONL и показывает дельту:
```
Skill recall    : 0.720  (✓ +0.109 vs baseline)
Skill precision : 0.540  (⚠ -0.230 vs baseline)
```

**MLflow experiment tracking:**  
Каждый прогон логируется в MLflow (`mlflow ui --port 5001`).  
Показывает историю всех runs, графики метрик по времени — удобно для сравнения после изменения промптов.

**Почему offline метрики важны?**  
skill_recall/precision и MAE работают без API-вызовов — можно запускать на каждом коммите в CI.  
LLM-judge запускают реже (дорого), но даёт human-readable оценку с reasoning.

---

## 5. Инфраструктура (docker-compose.yml)

```yaml
services:
  postgres:         # postgresql:16 — хранение сессий и анализов + langfuse БД
  qdrant:           # qdrant/qdrant — векторная БД для RAG
  langfuse-db-init: # one-shot: создаёт БД langfuse внутри postgres
  langfuse:         # langfuse/langfuse:2 — LLM трейсинг UI (port 3000)
```

**Два инструмента observability:**

| Инструмент | Порт | Назначение |
|---|---|---|
| **Langfuse** | 3000 | Production LLM трейсинг: каждый запрос → spans по нодам, Generations, Scores, Sessions |
| **MLflow** | 5001 | Eval experiments + (в будущем) LoRA fine-tuning tracking |

```bash
# Запустить инфраструктуру включая Langfuse
docker-compose up -d postgres qdrant langfuse

# MLflow UI (данные хранятся в ./mlruns, без docker)
mlflow ui --port 5001
```

**Почему не добавили Ollama в docker-compose?**  
Ollama требует GPU/MPS — запускается отдельно на хосте.  
Для CI и demo используется OpenAI.

**Langfuse трейсинг (`api/llm/streaming.py`):**
- Каждый `/api/analyze` запрос → trace `analyze_pipeline` с user_id и session_id
- `parse_node`, `gap_node` → `span()` с input/output данными ноды и latency_ms
- `advise_node` → `generation()` с model name и полным LLM ответом (Generations tab)
- После завершения → `trace.score()`: match_score, latency_s, skills_missing_count (Scores tab)
- Tags: [mode, seniority] — фильтрация в UI

---

## 6. Что дальше (план по неделям)

```
Неделя 1 (DONE ✅):
  api/agents/nodes/parse.py    — LLM структурный парсинг
  api/agents/nodes/gap.py      — gap анализ (ML + RAG)
  api/agents/nodes/advise.py   — генерация совета
  api/agents/graph.py          — LangGraph StateGraph
  api/llm/provider.py          — OpenAI / Ollama абстракция
  api/llm/streaming.py         — SSE event_stream
  api/routes/analyze.py        — POST /api/analyze (+ vacancy_url)
  api/routes/batch.py          — POST /api/batch
  api/db/models.py             — PostgreSQL ORM

Неделя 2 (DONE ✅ частично):
  api/clients/hh_client.py     — hh.ru Playwright клиент (bypass DDoS Guard)
  api/rag/embeddings.py        — shared embedding синглтоны
  api/rag/indexer.py           — Qdrant upsert (dense + sparse)
  api/rag/retriever.py         — hybrid search RRF
  scripts/index_vacancies.py   — CLI: Playwright → hh.ru → Qdrant (200–500 вакансий)

Неделя 2 (DONE ✅):
  api/ml/skill_extractor.py    — BERT NER для навыков (dslim/bert-base-NER)
  api/ml/seniority_clf.py      — zero-shot xlm-roberta (LoRA — Неделя 4)

Неделя 3 (DONE ✅):
  frontend/                      — React 19 + Vite 8 + Zustand + TanStack Query + Orval
    store/analysisStore.ts       — Zustand store: весь streaming state
    api/generated.ts             — orval codegen из FastAPI OpenAPI
    api/streaming.ts             — SSE логика вынесена отдельно
    hooks/useAnalyze.ts          — useMutation + Zustand callbacks
    hooks/useUploadResume.ts     — orval-хук для PDF upload
    hooks/useBatchAnalyze.ts     — хук для POST /api/batch
    components/ModeToggle.tsx    — переключатель: Анализ | Поиск работы | HR
    components/                  — PipelineProgress, MatchScore, SkillBadges, PipelineInspector
    widgets/AnalyzeForm.tsx      — форма: резюме (3 таба) + вакансия (2 таба)
    widgets/AnalysisResult.tsx   — результат: читает Zustand store напрямую
    widgets/BatchForm.tsx        — HR форма: вакансия + multi-PDF upload (параллельный парсинг)
    widgets/CandidateTable.tsx   — таблица кандидатов: rank, score, decision badge, навыки
    widgets/SeekForm.tsx         — форма поиска: резюме + фильтры (город/опыт/зарплата/remote)
    widgets/VacancyResultList.tsx — карточки вакансий, стримятся по мере анализа
    pages/AnalysisPage.tsx       — seeker режим (анализ)
    pages/HRBatchPage.tsx        — hr режим (batch анализ)
    pages/JobSeekPage.tsx        — seek режим (поиск работы)
    store/seekStore.ts           — Zustand store для seek режима
    hooks/useSeekVacancies.ts    — SSE хук для POST /api/seek
  api/llm/streaming.py           — +parsed_data и +gap_data SSE события, sse_encode публичная
  api/agents/nodes/parse.py      — with_structured_output(ParsedData) + Pydantic схема;
                                   smart_truncate_resume(); LLM явно разбивает составные скиллы
  api/agents/nodes/advise.py     — mode-aware промпты (seeker vs hr)
  api/agents/nodes/gap.py        — только пунктуация в _SEP (LLM теперь отвечает за семантику)
  api/agents/graph.py            — mode в JobMatchState
  api/llm/provider.py            — temperature через settings (LLM_TEMPERATURE=0.0 для reproducibility)
  api/ml/seniority_clf.py        — XLMRobertaTokenizer явно (fix AutoTokenizer bug в transformers>=4.47)
  api/settings.py                — llm_temperature, resume_context_limit, vacancy_context_limit
  api/clients/hh_client.py       — официальный API first, Playwright fallback;
                                   search_vacancies с фильтрами experience/salary/schedule
  api/clients/browser_pool.py    — shared Playwright singleton (lifespan, get_page context manager)
  api/clients/vacancy_search.py  — VacancySearchProvider Protocol + HHPlaywrightSearchProvider
                                   + HHOAuthSearchProvider (stub)
  api/clients/resume_parser.py   — PDF парсинг: blocks + position sort + noise filter (PyMuPDF)
  api/routes/seek.py             — POST /api/seek SSE: resume + filters → enrich → ranked vacancies
  api/routes/parse_resume.py     — POST /api/parse-resume (PDF upload)
  api/routes/fetch_vacancy.py    — POST /api/fetch-vacancy (URL → текст)
  api/rag/indexer.py             — hashlib.md5 вместо hash() (детерминированные ID)
  requirements.txt               — torch>=2.6.0, sentencepiece, langchain-ollama
  eval/dataset.py                — 6 тестовых EvalCase с ground truth (match range, missing skills, seniority)
  eval/metrics.py                — rouge_l, skill_recall, match_score_mae, match_score_in_range
  eval/judge.py                  — LLM-as-a-judge: GPT-4o-mini + with_structured_output(JudgeScore)
  eval/run_eval.py               — orchestrator: run_graph × N cases → offline + judge metrics → JSONL
  api/agents/nodes/gap.py        — auto-indexing: каждая вакансия → Qdrant (fire-and-forget)
  scripts/index_vacancies.py     — 16 универсальных специализаций вместо 5 ML-only;
                                   selector fallback + no_magic + area=113 (гео-редирект fix)

Неделя 3 (DONE ✅) — Auth + History + Full History:
  api/auth/jwt.py                — bcrypt хэширование, JWT encode/decode (python-jose)
                                   bcrypt используется напрямую (passlib несовместим с bcrypt>=4.x)
  api/auth/deps.py               — current_user_optional (для /analyze, /seek, /batch)
                                   current_user_required (для /history, /batch-history, /seek-history)
  api/routes/auth.py             — POST /api/auth/register + POST /api/auth/login → JWT
  api/routes/history.py          — GET /api/history (paginated, mode filter)
                                   GET|DELETE /api/analyses/{id}
                                   GET /api/batch-history, GET|DELETE /api/batch-history/{id}
                                   GET /api/seek-history, GET|DELETE /api/seek-history/{id}
  api/routes/batch.py            — optional auth: если авторизован → сохраняет BatchSession в БД
  api/routes/seek.py             — optional auth: если авторизован → сохраняет SeekSession в БД
  api/db/models.py               — User, Session, Analysis, BatchSession, SeekSession
  alembic/                       — 4 миграции: users, role, batch_sessions, seek_sessions
  frontend/components/AppHeader.tsx — роль-зависимые табы:
                                   seeker: [Анализ резюме] [Поиск работы]
                                   hr:     [Оценка кандидата] [Скрининг резюме]
  frontend/pages/HistoryPage.tsx — роль-зависимые табы истории:
                                   seeker: "Анализ резюме" | "Поиск работы"
                                   hr: "Оценка кандидата" | "Скрининг резюме"
                                   удаление с ConfirmDialog (модальное подтверждение)
  frontend/pages/AnalysisDetailPage.tsx — ScoreRing, навыки, LLM advice, raw texts
  frontend/pages/BatchDetailPage.tsx — детальный просмотр скрининга: ранжированный список кандидатов
  frontend/pages/SeekDetailPage.tsx  — детальный просмотр поиска: карточки вакансий с решением
  frontend/components/ui/confirm-dialog.tsx — переиспользуемый модальный диалог подтверждения
  frontend/pages/HRBatchPage.tsx — рефакторинг: 2-колоночный layout (форма слева, результат справа)
  frontend/hooks/useHistory.ts   — mode filter, хуки для batch-history и seek-history
  frontend/hooks/useBatchAnalyze.ts — Authorization header (был без токена — batch не сохранялся)
  frontend/hooks/useSeekVacancies.ts — Authorization header (был без токена — seek не сохранялся)

Неделя 4 (DONE ✅) — Eval pipeline + Observability:
  eval/metrics.py                — skill_precision, skill_f1, latency_ms
  eval/judge.py                  — faithfulness критерий (галлюцинации)
  eval/run_eval.py               — latency tracking, regression comparison vs baseline, MLflow logging
  docker-compose.yml             — Langfuse сервис (langfuse/langfuse:2 + postgres DB init)
  api/settings.py                — langfuse_host, langfuse_public_key, langfuse_secret_key
  api/llm/streaming.py           — Langfuse direct client (не LangChain callback):
                                   trace per request (user_id, session_id, tags, model)
                                   span() для parse_node и gap_node (input/output/latency_ms)
                                   generation() для advise_node (model name, LLM output)
                                   trace.score(): match_score, latency_s, skills_missing_count
                                   _trim_state() — трункация длинных строк для UI
  api/routes/analyze.py          — session_id из БД → Langfuse trace (Sessions tab)
                                   user_id до db.commit() (fix MissingGreenlet)
  requirements.txt               — langchain>=1.3.0, langfuse>=2.0.0,<3.0.0, mlflow>=2.10.0

Неделя 4 (DONE ✅) — Качество сервиса + Skill matching:
  api/ml/skill_matcher.py        — новый модуль: двухэтапный skill matching
                                   Stage 1: exact normalized match (_normalize strips [\s.\-_/])
                                   Stage 2: cosine similarity BAAI/bge-small-en-v1.5
                                   merge_skills(primary, supplement) — LLM первичный, NER дополняет
                                   SKILL_MATCH_THRESHOLD через settings (default 0.75, .env)
  api/ml/skill_extractor.py      — фильтрация ## BERT subword-артефактов (мусор на русском тексте)
  api/agents/nodes/gap.py        — LLM-primary + NER-supplement (merge_skills → match_skills)
  api/agents/nodes/parse.py      — OR-условия → первый вариант; фильтрация "изучаю/learning" скиллов
  api/agents/nodes/advise.py     — detect_language() → {language} в промпт (Russian/English)
  api/llm/language.py            — новый модуль: Cyrillic ratio > 15% → Russian
  api/settings.py                — skill_match_threshold: float = 0.75
  eval/metrics.py                — advice_similarity() через BAAI/bge cosine (заменяет rouge_l как основную)
  eval/run_eval.py               — advice_similarity в summary, MLflow logging, regression comparison
  eval/dataset.py                — 8 кейсов (добавлены #7 UX Designer→ML, #8 Russian ML→LLM Engineer)
                                   исправлены диапазоны #2, #3, #4 по реальным результатам

Следующий блок:
  ml/train_seniority.py          — обучение LoRA модели (PEFT/LoRA fine-tuning)
  ml/train_ner.py                — fine-tuning NER на реальных данных
  README.md + финальная документация
```

---

## 7. Ключевые архитектурные решения (для собеседования)

**Q: Почему LangGraph, а не цепочка вызовов функций?**  
A: LangGraph даёт явный граф состояния, checkpoint при сбое, встроенный стриминг событий через `astream_events`. При масштабировании легко добавить параллельные ветви (gap и parse одновременно) или human-in-the-loop.

**Q: Почему SSE, а не WebSocket?**  
A: SSE — однонаправленный поток сервер → клиент, достаточен для нашего случая. Проще (HTTP), хорошо поддерживается браузерами, не требует отдельного WS-сервера.

**Q: Почему гибридный поиск в Qdrant?**  
A: Dense-only пропускает точные термины ("LangGraph"), sparse-only не понимает синонимы. RRF объединяет оба ранжирования и даёт лучший top-k.

**Q: Почему PEFT/LoRA для классификатора уровня?**  
A: DistilBERT с полным fine-tuning требует больше ресурсов. LoRA обучает только ~1% параметров (rank-16 адаптер), достигает сопоставимого качества. Это production-паттерн для быстрого переобучения на новых данных.

**Q: Как масштабировать на миллионы пользователей?**  
A: (1) Горизонтальное масштабирование API за load balancer, (2) очередь задач (Celery/ARQ) для тяжёлых ML-инференсов, (3) кэш результатов для одинаковых вакансий, (4) async everywhere — не блокируем event loop.
