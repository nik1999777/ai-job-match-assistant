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
| Structured output | JSON-парсинг резюме/вакансии через LLM | `api/agents/nodes/parse.py` |
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
│                         КЛИЕНТ                                  │
│                   React + Vite (port 5173)                      │
│          form: resume text + vacancy URL/text                   │
└─────────────────────────┬───────────────────────────────────────┘
                          │ POST /api/analyze
                          │ (SSE response — сервер шлёт события по мере готовности)
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FASTAPI (port 8000)                          │
│                                                                 │
│  /api/analyze  →  записывает Session + Analysis в PostgreSQL    │
│                →  запускает LangGraph граф                      │
│                →  стримит SSE события обратно                   │
│                                                                 │
│  /api/batch    →  batch анализ нескольких пар (очередь)         │
│  /health       →  healthcheck: DB + Qdrant                      │
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
  "resume": "Опыт: 3 года Python, FastAPI...",
  "vacancy": "Требуется ML Engineer, LangChain...",
  "mode": "seeker"
}
```

**Что происходит в `api/routes/analyze.py`:**
1. Создаётся `Session` (mode="seeker") — сохраняется в PostgreSQL
2. Создаётся `Analysis` (resume_text, vacancy_text) — FK на Session
3. Строится LangGraph граф через `build_graph()`
4. Запускается `event_stream(graph, resume, vacancy)` — асинхронный генератор
5. Возвращается `StreamingResponse` с `media_type="text/event-stream"`

### Шаг 2 — parse_node (LLM структурный парсинг)

**Файл:** `api/agents/nodes/parse.py`

```
Вход:  state = {"resume": "...", "vacancy": "..."}
Выход: state + {"parsed": {
    "resume_summary": "Senior Python developer...",
    "vacancy_summary": "ML Engineer at hh.ru AI Lab...",
    "resume_skills": ["python", "fastapi", "pytorch"],
    "vacancy_skills": ["langchain", "qdrant", "pytorch", "peft"],
    "vacancy_seniority_hint": "senior"
}}
```

**Промпт:** просит LLM вернуть чистый JSON (structured output).  
**Зачем LLM, а не regex?** Навыки написаны по-разному в каждом резюме, LLM их нормализует.

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

Собирает всё в один промпт и просит LLM сгенерировать 4-секционный совет:
- **Overall Assessment** — общая оценка совместимости
- **Top Skills to Develop** — 3 самых важных навыка + как учить
- **Resume Improvements** — конкретные правки в резюме
- **Application Strategy** — как позиционировать кандидатуру

**Почему финальный шаг через LLM?** Предыдущие узлы дали структурированные данные (числа, списки). LLM на последнем шаге генерирует связный human-readable текст.

### Шаг 5 — SSE Streaming

**Файл:** `api/llm/streaming.py`

LangGraph транслирует события через `astream_events(version="v2")`.  
Мы фильтруем нужные и шлём клиенту:

```
data: {"event": "node_start", "node": "parse_node"}

data: {"event": "node_done", "node": "parse_node"}

data: {"event": "node_start", "node": "gap_node"}

data: {"event": "node_done", "node": "gap_node"}

data: {"event": "node_start", "node": "advise_node"}

data: {"event": "token", "content": "## Overall"}    ← LLM стримит
data: {"event": "token", "content": " Assessment"}
data: {"event": "token", "content": "\nYour match..."}
...

data: {"event": "done", "state": {...финальный стейт...}}
```

Клиент рендерит прогресс в реальном времени — видно, что сейчас делает система.

---

## 4. Детали каждого компонента

### 4.1 LLM Provider (`api/llm/provider.py`)

```python
# Паттерн: абстракция провайдера
get_llm()  →  ChatOpenAI(gpt-4o-mini)   # если LLM_PROVIDER=openai
           →  ChatOllama(llama3.2)       # если LLM_PROVIDER=ollama
```

**Зачем два провайдера?**
- **OpenAI** — для разработки и демо (качество, скорость)
- **Ollama** — для локального запуска без интернета, privacy, нулевые затраты

Оба реализуют `BaseChatModel` из LangChain — остальной код не меняется.  
Это демонстрирует понимание абстракций и разделения ответственности.

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

### 4.4 ML Слой (планируется)

#### `api/ml/skill_extractor.py` — NER на BERT
```
Задача: извлечь технические навыки из произвольного текста
Модель: dslim/bert-base-NER (fine-tuned на tech skills)
Метод: HuggingFace pipeline("ner", aggregation_strategy="simple")
Fallback: если model не загружена → возвращает [] → gap_node берёт из LLM parse
```

#### `api/ml/seniority_clf.py` — классификация уровня через LoRA
```
Задача: junior / middle / senior по тексту резюме
Модель: distilbert-base-uncased + LoRA (PEFT)
Обучение: синтетические примеры резюме трёх уровней
Выход: (label, confidence)
```

**Почему LoRA?** Экономит память (обучаем только адаптер ~1% параметров).  
Демонстрирует знание PEFT — прямое требование вакансии.

### 4.5 Слой данных — hh.ru API

#### Откуда берутся данные

```
ИСТОЧНИКИ ДАННЫХ
├── Вакансии для RAG (знания системы)
│   └── scripts/index_vacancies.py
│       → GET https://api.hh.ru/vacancies?text=ML+Engineer
│       → GET https://api.hh.ru/vacancies/{id}   (полный текст)
│       → embed → Qdrant (10 000+ вакансий)
│
├── Конкретная вакансия для анализа (от пользователя)
│   ├── вариант A: пользователь вставляет текст
│   └── вариант B: пользователь даёт URL → api/clients/hh_client.py fetches
│
└── Резюме пользователя
    ├── вариант A: пользователь вставляет текст  ← реализовано
    └── вариант B: hh.ru OAuth → GET /resumes/mine  ← будущая фича
```

**Почему нельзя парсить чужие резюме?**  
hh.ru API закрывает резюме — `GET /resumes/{id}` требует OAuth именно того человека. Это правильно с точки зрения privacy. Реальный продукт hh.ru работает так же: пользователь логинится, даёт доступ к своему резюме.

#### `api/clients/hh_client.py` — HTTP клиент к hh.ru

```python
# Основные функции:
get_vacancy(vacancy_id)          → dict  # полный JSON вакансии
get_vacancy_by_url(url_or_id)    → (text, raw_json)  # для /api/analyze
search_vacancies(query, area, per_page, page)  → list  # для индексации
vacancy_to_text(data)            → str   # HTML description → plain text
extract_vacancy_id(url)          → str   # "hh.ru/vacancy/12345" → "12345"
```

hh.ru возвращает описание вакансии в HTML — `vacancy_to_text()` стрипает теги regex'ом и нормализует пробелы. Авторизация не нужна, только `User-Agent` заголовок.

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
# Наполнить базу данными перед первым запуском API:
python -m scripts.index_vacancies

# Кастомные запросы:
python -m scripts.index_vacancies --query "LLM Engineer" --query "AI разработчик" --pages 5

# Санкт-Петербург:
python -m scripts.index_vacancies --area 2
```

Скрипт делает паузу 200ms между запросами — не превышает rate limit hh.ru (~5 req/sec). Поддерживает `--pages N` × 100 вакансий на страницу. `upsert` в Qdrant — повторный запуск идемпотентен.

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
  api/clients/hh_client.py     — hh.ru API клиент (вакансии)
  api/rag/embeddings.py        — shared embedding сингтоны
  api/rag/indexer.py           — Qdrant upsert (dense + sparse)
  api/rag/retriever.py         — hybrid search RRF
  scripts/index_vacancies.py   — CLI: fetch hh.ru → Qdrant

Неделя 2 (ОСТАЛОСЬ):
  api/ml/skill_extractor.py    — BERT NER для навыков
  api/ml/seniority_clf.py      — DistilBERT + LoRA классификатор

Неделя 3:
  frontend/                    — React + Vite UI
  eval/                        — LLM-as-a-judge eval pipeline

Неделя 4:
  ml/train_seniority.py        — обучение LoRA модели
  ml/train_ner.py              — fine-tuning NER
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
