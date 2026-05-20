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
| PyTorch + HuggingFace + PEFT | NER skill extractor + LoRA seniority clf | `api/ml/` |
| FastAPI + asyncio, высоконагруженный сервис | Async API, SSE streaming, batch endpoint | `api/routes/` |
| PostgreSQL + SQLAlchemy | Async ORM, Session + Analysis модели | `api/db/models.py` |
| Векторные БД (Qdrant) | Гибридный поиск (dense + sparse BM42) | `api/rag/` |
| Мониторинг реальной работы ассистентов | Сохранение результатов в БД, eval pipeline | `api/db/`, `eval/` |
| Инференс open-source LLM | Ollama-провайдер (llama3.2) | `api/llm/provider.py` |

---

## 2. Общая схема системы

```
┌─────────────────────────────────────────────────────────────────┐
│                         КЛИЕНТ (3 режима)                       │
│     React 19 + Vite 8 + Zustand + TanStack Query + Orval        │
│                                                                 │
│  [Анализ 1:1]  resume + vacancy → SSE анализ (seeker/hr)       │
│  [Поиск работы] resume + фильтры → N вакансий → ranked results │
│  [HR]          1 vacancy + N резюме → batch ranking            │
└─────────┬──────────────────┬──────────────────┬────────────────┘
          │ POST /api/analyze │ POST /api/seek   │ POST /api/batch
          │ SSE               │ SSE              │ JSON
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FASTAPI (port 8000)                          │
│                                                                 │
│  /api/analyze   → резюме + вакансия + mode → LangGraph → SSE   │
│  /api/seek      → резюме + фильтры → поиск → N×LangGraph → SSE │
│  /api/batch     → вакансия + N резюме → asyncio.gather → JSON  │
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
│  GPT-4o-mini│   │  (BERT NER          (DistilBERT + LoRA)      │
│     OR      │   │   fine-tuned)        junior/mid/senior       │
│  Ollama     │   │                                              │
│  llama3.2   │   │  Qdrant Retriever   Qdrant Indexer           │
│             │   │  hybrid search      dense(BAAI) +            │
│  Streaming  │   │  top-k vacancies    sparse(BM42)             │
│  via SSE    │   └──────────────────────────────────────────────┘
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
- `Field(description=...)` явно инструктирует: `'react-router' → 'React'`, `'React 19' → 'React'`

**Зачем LLM, а не regex?** Навыки написаны по-разному в каждом резюме, LLM нормализует контекстно.

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

**Три параллельных источника:**

```
resume text ──► SkillExtractor (BERT NER) ──► resume_skills (ML)
vacancy text ──► SkillExtractor (BERT NER) ──► vacancy_skills (ML)
                       ↕ fallback: если NER пустой — берём из parse_node

resume text ──► SeniorityClassifier (DistilBERT + LoRA) ──► seniority

vacancy text ──► Qdrant hybrid search ──► top-3 похожих вакансий
```

### Шаг 4 — advise_node (LLM генерация совета)

**Файл:** `api/agents/nodes/advise.py`

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
- **OpenAI** — для разработки и демо (качество, скорость, нативный structured output)
- **Ollama** — для локального запуска без интернета, privacy, нулевые затраты

Оба реализуют `BaseChatModel` из LangChain — остальной код не меняется.

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
├── sessions
│   ├── id (UUID, PK)
│   ├── mode ("seeker" | "hr")
│   └── created_at
│
└── analyses
    ├── id (UUID, PK)
    ├── session_id (FK → sessions)
    ├── resume_text
    ├── vacancy_text
    ├── match_score (float, nullable — заполняется после)
    ├── seniority (str, nullable)
    ├── seniority_confidence (float, nullable)
    ├── skills_found (JSON string)
    ├── skills_missing (JSON string)
    ├── llm_response (text, nullable)
    └── created_at
```

**AsyncPG + SQLAlchemy async** — неблокирующие запросы к БД.  
Сессия создаётся до запуска графа, результаты записываются после завершения.

### 4.4 ML Слой

#### `api/ml/skill_extractor.py` — NER на BERT
```
Задача: извлечь технические навыки из произвольного текста
Модель: dslim/bert-base-NER
Метод: pipeline("ner", aggregation_strategy="simple") — lazy load через @cache
Вход: первые 1800 символов текста (~450 BERT токенов)
Выход: слова из MISC + ORG entity групп (где живут tech-термины)
Fallback: если NER пустой → gap_node берёт навыки из LLM parse
```

#### `api/ml/seniority_clf.py` — zero-shot классификация уровня
```
Задача: junior / middle / senior по тексту резюме
Модель: joeddav/xlm-roberta-large-xnli (multilingual NLI)
Метод: pipeline("zero-shot-classification") — lazy load через @cache
Вход: первые 600 символов резюме (сигнал уровня плотный в начале)
Выход: (label, confidence) — например ("middle", 0.82)
Multilingual: xlm-roberta работает с русским текстом hh.ru
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

#### `scripts/index_vacancies.py` — CLI для наполнения базы

```bash
# Наполнить базу (запускать один раз, ~40 мин на 500 вакансий):
python -m scripts.index_vacancies

# Кастомные запросы:
python -m scripts.index_vacancies --query "LLM Engineer" --query "AI разработчик" --pages 5

# Санкт-Петербург, пауза 3 сек:
python -m scripts.index_vacancies --area 2 --pause 3
```

Один Playwright браузер на всю сессию — DDoS Guard cookies переиспользуются. Пауза 2 сек между запросами (настраивается `--pause`). `upsert` в Qdrant — повторный запуск идемпотентен.

### 4.6 Eval Pipeline (планируется)

```
eval/
├── judge.py          — LLM-as-a-judge: Claude/GPT оценивает качество совета
├── metrics.py        — offline метрики: Rouge-L, BERTScore
├── dataset.py        — тестовые пары резюме/вакансий с референсными ответами
└── run_eval.py       — запуск прогона + сохранение в eval_results.jsonl
```

**Что такое LLM-as-a-judge?**  
Вместо человека берём сильную модель (GPT-4) и просим оценить ответ нашей системы по критериям (relevance, actionability, accuracy).  
Это стандартная практика в AI Lab для offline-мониторинга качества.

---

## 5. Инфраструктура (docker-compose.yml)

```yaml
services:
  postgres:   # postgresql:15 — хранение сессий и анализов
  qdrant:     # qdrant/qdrant — векторная БД для RAG
  api:        # наш FastAPI сервис (зависит от postgres + qdrant)
```

**Почему не добавили Ollama в docker-compose?**  
Ollama требует GPU/MPS — запускается отдельно на хосте.  
Для CI и demo используется OpenAI.

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
    components/ModeToggle.tsx    — переключатель: Анализ 1:1 | Поиск работы | HR
    components/                  — PipelineProgress, MatchScore, SkillBadges, PipelineInspector
    widgets/AnalyzeForm.tsx      — форма: резюме (3 таба) + вакансия (2 таба)
    widgets/AnalysisResult.tsx   — результат: читает Zustand store напрямую
    widgets/BatchForm.tsx        — HR форма: вакансия + multi-PDF upload (параллельный парсинг)
    widgets/CandidateTable.tsx   — таблица кандидатов: rank, score, decision badge, навыки
    widgets/SeekForm.tsx         — форма поиска: резюме + фильтры (город/опыт/зарплата/remote)
    widgets/VacancyResultList.tsx — карточки вакансий, стримятся по мере анализа
    pages/AnalysisPage.tsx       — seeker режим (анализ 1:1)
    pages/HRBatchPage.tsx        — hr режим (batch анализ)
    pages/JobSeekPage.tsx        — seek режим (поиск работы)
    store/seekStore.ts           — Zustand store для seek режима
    hooks/useSeekVacancies.ts    — SSE хук для POST /api/seek
  api/llm/streaming.py           — +parsed_data и +gap_data SSE события, sse_encode публичная
  api/agents/nodes/parse.py      — with_structured_output(ParsedData) + Pydantic схема
  api/agents/nodes/advise.py     — mode-aware промпты (seeker vs hr)
  api/agents/graph.py            — mode в JobMatchState
  api/clients/hh_client.py       — официальный API first, Playwright fallback;
                                   search_vacancies с фильтрами experience/salary/schedule
  api/clients/browser_pool.py    — shared Playwright singleton (lifespan, get_page context manager)
  api/clients/vacancy_search.py  — VacancySearchProvider Protocol + HHPlaywrightSearchProvider
                                   + HHOAuthSearchProvider (stub)
  api/clients/resume_parser.py   — PDF парсинг: blocks + position sort + noise filter (PyMuPDF)
  api/routes/seek.py             — POST /api/seek SSE: resume + filters → enrich → ranked vacancies
  api/agents/nodes/parse.py      — +smart_truncate_resume(): секция навыков приоритетнее при обрезке
  api/routes/parse_resume.py     — POST /api/parse-resume (PDF upload)
  api/routes/fetch_vacancy.py    — POST /api/fetch-vacancy (URL → текст)
  api/rag/indexer.py             — hashlib.md5 вместо hash() (детерминированные ID)

Неделя 4:
  eval/                          — LLM-as-a-judge eval pipeline
  ml/train_seniority.py          — обучение LoRA модели
  ml/train_ner.py                — fine-tuning NER
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
