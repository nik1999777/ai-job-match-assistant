# Backend — Архитектура и объяснение для JS разработчика

---

## Структура папки `api/`

```
api/
├── main.py          ← точка входа (как index.js в Express)
├── settings.py      ← переменные окружения (как dotenv + config object)
│
├── routes/          ← роуты (как routes/ в Express)
│   ├── analyze.py       ← POST /api/analyze — SSE стриминг (1 резюме × 1 вакансия)
│   │                      принимает: resume/resume_url + vacancy/vacancy_url + mode
│   │                      auto-detect платформы (hh.ru vs linkedin.com)
│   ├── seek.py          ← POST /api/seek — SSE поиск вакансий по резюме
│   │                      принимает: resume + filters (job_title, area, experience,
│   │                                salary_from, remote, count)
│   │                      flow: parse resume → search → N×LangGraph → stream results
│   ├── parse_resume.py  ← POST /api/parse-resume — PDF → текст (PyMuPDF)
│   ├── fetch_vacancy.py ← POST /api/fetch-vacancy — URL → текст вакансии
│   │                      hh.ru: официальный API + Playwright fallback
│   │                      LinkedIn: Playwright stealth
│   ├── batch.py         ← POST /api/batch — пакетный анализ (mode=hr, макс 20)
│   └── health.py        ← GET  /health   — healthcheck DB + Qdrant
│
├── agents/          ← LangGraph пайплайн (вся бизнес-логика)
│   ├── graph.py     ← собирает граф из трёх узлов
│   └── nodes/
│       ├── parse.py   ← узел 1: LLM → структурированный JSON из резюме/вакансии
│       ├── gap.py     ← узел 2: ML навыки + RAG похожие вакансии
│       └── advise.py  ← узел 3: LLM → совет по 4 секциям
│
├── llm/
│   ├── provider.py    ← фабрика: ChatOpenAI (openai) или ChatOllama (langchain-ollama)
│   └── streaming.py   ← читает astream_events из LangGraph, шлёт SSE; принимает mode
│
├── ml/
│   ├── skill_extractor.py  ← BERT NER: найти навыки в тексте
│   └── seniority_clf.py    ← DistilBERT + LoRA: junior / middle / senior
│
├── rag/
│   ├── embeddings.py  ← синглтоны моделей (dense BAAI + sparse BM42)
│   ├── indexer.py     ← записать вакансию в Qdrant (upsert)
│   └── retriever.py   ← hybrid search RRF, возвращает top-k вакансий
│
├── clients/
│   ├── hh_client.py         ← get_vacancy_by_url (API + Playwright fallback)
│   │                           search_vacancies (params: query, area, experience,
│   │                           salary_from, schedule) — используется HHOAuthSearchProvider
│   ├── vacancy_search.py    ← VacancySearchProvider Protocol + реализации:
│   │                           HHPlaywrightSearchProvider — scrapes hh.ru search page
│   │                             (1 Playwright сеанс, JS evaluate, без auth)
│   │                           HHOAuthSearchProvider     — api.hh.ru с токеном (stub)
│   │                           LinkedInSearchProvider    — LinkedIn/Apify (stub)
│   │                           get_search_provider()     — фабрика (единая точка смены)
│   ├── resume_parser.py     ← Playwright: hh.ru профиль; PyMuPDF: PDF → текст
│   └── linkedin_client.py   ← Playwright + stealth JS: вакансии LinkedIn
│
└── db/
    └── models.py      ← PostgreSQL: таблицы Session + Analysis (SQLAlchemy)
```

---

## Python vs JS — самое важное

### Синтаксис

```python
# Нет var/const/let — просто присваивание
name = "Nikita"
name: str = "Nikita"   # с type hint (как TypeScript)

# f-строки = template literals
f"Hello {name}"        # = `Hello ${name}`

# Словарь = объект, но через скобки
user = {"name": "Nikita"}
user["name"]           # не user.name — только скобки
user.get("name")       # безопасно (не упадёт если нет ключа)

# Spread = **
{**state, "new_key": "value"}   # = {...state, newKey: "value"}

# List comprehension = .map() + .filter()
[s.upper() for s in skills]              # = skills.map(s => s.toUpperCase())
[s for s in skills if len(s) > 5]       # = skills.filter(s => s.length > 5)

# None = null/undefined
if result is None: ...
if result is not None: ...
```

### Декораторы — ключевая концепция FastAPI

```python
# @ перед функцией = декоратор = оборачивает функцию
@router.get("/health")
async def health_check():
    return {"status": "ok"}

# Это эквивалентно:
# health_check = router.get("/health")(health_check)
# В Express ближайший аналог — middleware
```

### async/await — как в JS, но с нюансом

```python
# В Python забыть await — НЕ ошибка компилятора, просто вернёт объект корутины
result = chain.ainvoke(...)    # ← вернёт <coroutine object> а не данные!
result = await chain.ainvoke(...)  # ← правильно
```

---

## FastAPI = Express для Python

| Express | FastAPI |
|---|---|
| `express()` | `FastAPI()` |
| `app.use(cors())` | `app.add_middleware(CORSMiddleware, ...)` |
| `router.post('/path', handler)` | `@router.post('/path')` |
| `req.body` | параметр функции с Pydantic-типом |
| `res.json({})` | просто `return {}` |
| `res.status(400).json({error})` | `raise HTTPException(status_code=400, detail="...")` |
| `app.listen(3000)` | `uvicorn api.main:app --port 8000` |
| `process.env.KEY` | `settings.key` (Pydantic Settings) |

### Pydantic = Zod + runtime валидация

```python
class AnalyzeRequest(BaseModel):
    resume: str                    # обязательное
    vacancy_url: str | None = None # опциональное (None = undefined)
    mode: str = "seeker"           # со значением по умолчанию

# FastAPI автоматически:
# 1. Парсит JSON body → AnalyzeRequest
# 2. Валидирует типы (вернёт 422 если не то)
# 3. Документирует в /docs (Swagger бесплатно)
```

### Dependency Injection = встроенный middleware

```python
# Depends(get_session) — FastAPI сам создаёт db-сессию и передаёт
@router.post("/analyze")
async def analyze(body: AnalyzeRequest, db: AsyncSession = Depends(get_session)):
    ...
# В Express ты бы делал это через middleware вручную
```

---

## LangGraph — граф из async функций

```python
# Концептуально это пайплайн:
# state = await parse_node(state)  →  state = await gap_node(state)  →  state = await advise_node(state)

# Каждый узел — просто async функция
async def parse_node(state: dict) -> dict:
    result = await llm.ainvoke(...)
    return {**state, "parsed": result}   # возвращаем обновлённый state

# Граф собирается один раз
graph = StateGraph(JobMatchState)
graph.add_node("parse_node", parse_node)
graph.add_edge("parse_node", "gap_node")
# ...
compiled = graph.compile()

# Запускается с astream_events → получаем события каждого шага
async for event in compiled.astream_events(initial_state, version="v2"):
    ...
```

---

## SSE Streaming — поток от сервера

```
Клиент → POST /api/analyze
Сервер  ← держит соединение открытым, шлёт события:

data: {"event": "node_start", "node": "parse_node"}
data: {"event": "node_done",  "node": "parse_node"}
data: {"event": "node_start", "node": "gap_node"}
data: {"event": "node_done",  "node": "gap_node"}
data: {"event": "node_start", "node": "advise_node"}
data: {"event": "token", "content": "## Overall"}   ← LLM токены только от advise_node
data: {"event": "token", "content": " Assessment"}
data: {"event": "done", "state": {...финальный стейт...}}
```

> **Важно:** токены стримятся только из `advise_node`. `parse_node` тоже вызывает LLM,
> но выводит JSON — его токены фильтруются, чтобы не попасть в UI как текст совета.

```python
# api/llm/streaming.py — трек активной ноды
_current_node = None
if kind == "on_chain_start" and name in _NODE_NAMES:
    _current_node = name
elif kind == "on_chat_model_stream" and _current_node == "advise_node":
    yield token_event  # только advise
```

---

## База данных — SQLAlchemy = Prisma/TypeORM

```python
# Модель = таблица
class Analysis(Base):
    __tablename__ = "analyses"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    match_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    # nullable=True = поле заполняется позже (после завершения графа)

# Использование — как Prisma
analysis = Analysis(session_id=session.id, resume_text=body.resume)
db.add(analysis)          # INSERT INTO (ещё не отправлено)
await db.commit()         # реально записывается в PostgreSQL
await db.refresh(analysis) # перечитываем чтобы получить auto-generated поля
```

---

## hh.ru API — источник данных

```python
# api/clients/hh_client.py
# GET /vacancies/{id} — работает без авторизации
async def get_vacancy(vacancy_id: str) -> dict: ...

# GET /vacancies?text=... — требует OAuth-приложения (403 без токена)
# Используется только в HHOAuthSearchProvider
async def search_vacancies(query, area, per_page, experience, salary_from, schedule) -> list[dict]: ...

# vacancy_to_text: dict → plain text (HTML → regex strip)
```

## VacancySearchProvider — абстракция поиска

```python
# api/clients/vacancy_search.py — Open/Closed principle
class VacancySearchProvider(Protocol):
    async def search(self, filters: SearchFilters) -> list[VacancyItem]: ...

# Меняем только get_search_provider() при подключении нового источника:
def get_search_provider() -> VacancySearchProvider:
    return HHPlaywrightSearchProvider()   # сейчас
    # return HHOAuthSearchProvider()      # после регистрации app hh.ru
    # return LinkedInSearchProvider()     # после подключения LinkedIn API
```

**HHPlaywrightSearchProvider** — текущая реализация:
1. Playwright открывает `https://hh.ru/search/vacancy?text=...&area=...`
2. `page.evaluate(JS)` — за один вызов достаёт все карточки: id, title, company, address, exp
3. Возвращает `VacancyItem[]` — никаких дополнительных запросов

**SearchFilters:**
```python
class SearchFilters(BaseModel):
    query: str           # запрос (job title или auto из resume skills)
    area: int = 1        # 1=Москва, 2=СПб, 113=вся Россия
    experience: str | None  # noExperience|between1And3|between3And6|moreThan6
    salary_from: int | None
    remote: bool = False
    count: int = 10      # макс 20
```

---

## Как запустить

```bash
# 1. Поднять PostgreSQL + Qdrant
docker-compose up -d postgres qdrant

# 2. Виртуальное окружение Python (= node_modules, только для Python)
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# 3. Установить зависимости (= npm install)
pip install -r requirements.txt

# 4. Заполнить .env (скопировать из .env.example, добавить OPENAI_API_KEY)
cp .env.example .env

# 5. Наполнить Qdrant вакансиями с hh.ru
python -m scripts.index_vacancies

# 6. Запустить сервер (= nodemon / node index.js)
uvicorn api.main:app --reload --port 8000

# 7. Swagger документация — бесплатно в FastAPI
# http://localhost:8000/docs
```
