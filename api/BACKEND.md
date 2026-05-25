# Backend — Архитектура и объяснение для JS разработчика

---

## Структура папки `api/`

```
api/
├── main.py          ← точка входа (как index.js в Express)
│                      lifespan: init_db() + browser_pool.start()/stop()
├── settings.py      ← переменные окружения (как dotenv + config object)
│                      + JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRE_MINUTES
│
├── auth/            ← JWT аутентификация
│   ├── jwt.py           ← hash_password, verify_password (bcrypt direct),
│   │                      create_access_token, decode_token (python-jose)
│   └── deps.py          ← FastAPI Depends:
│                          current_user_optional — JWT из Bearer, None если нет токена
│                          current_user_required — поднимает 401 если нет токена
│
├── routes/          ← роуты (как routes/ в Express)
│   ├── auth.py          ← POST /api/auth/register → {email, password, role} → JWT
│   │                      POST /api/auth/login    → {email, password} → JWT
│   │                      Ответ: {access_token, token_type, user_id, email, role}
│   ├── analyze.py       ← POST /api/analyze — SSE стриминг (1 резюме × 1 вакансия)
│   │                      принимает: resume (текст) + vacancy/vacancy_url + mode
│   │                      user_id из JWT → сохраняется в Session.user_id
│   ├── seek.py          ← POST /api/seek — SSE поиск вакансий по резюме
│   │                      flow: parse resume → Playwright search → enrich via API
│   │                            → N×LangGraph параллельно → stream results
│   ├── history.py       ← GET  /api/history — список анализов (paginated, mode filter, JWT required)
│   │                      GET|DELETE /api/analyses/{id} (JWT required)
│   │                      GET  /api/batch-history — история скринингов (JWT required)
│   │                      GET|DELETE /api/batch-history/{id} (JWT required)
│   │                      GET  /api/seek-history — история поисков (JWT required)
│   │                      GET|DELETE /api/seek-history/{id} (JWT required)
│   ├── parse_resume.py  ← POST /api/parse-resume — PDF → текст (PyMuPDF)
│   ├── fetch_vacancy.py ← POST /api/fetch-vacancy — hh.ru URL → текст вакансии
│   │                      официальный API + Playwright fallback
│   ├── batch.py         ← POST /api/batch — пакетный анализ (mode=hr, макс 20)
│   │                      optional auth: если авторизован → сохраняет BatchSession в БД
│   │                      ответ включает id сессии (для ссылки на историю)
│   └── health.py        ← GET  /health   — healthcheck DB + Qdrant
│
├── agents/          ← LangGraph пайплайн (вся бизнес-логика)
│   ├── graph.py     ← собирает граф из трёх узлов
│   └── nodes/
│       ├── parse.py   ← узел 1: LLM → структурированный JSON из резюме/вакансии
│       │                smart_truncate_resume() — приоритет секции навыков при обрезке
│       ├── gap.py     ← узел 2: ML навыки + seniority penalty + RAG + auto-index в Qdrant
│       │                _seniority_penalty(candidate, vacancy_hint): 10%/уровень, max 20%
│       │                match_score = skill_score * (1 - penalty); "not specified" → 0%
│       └── advise.py  ← узел 3: LLM → совет по 4 секциям
│
├── llm/
│   ├── provider.py    ← фабрика: ChatOpenAI/Claude (prod) или ChatOllama (dev only)
│   ├── language.py    ← detect_language(text): Cyrillic ratio > 15% → "Russian"
│   └── streaming.py   ← читает astream_events из LangGraph, шлёт SSE; Langfuse трейсинг:
│                          trace per request (user_id, session_id, tags=[mode, seniority])
│                          span() для parse_node/gap_node — input/output/latency_ms
│                          generation() для advise_node — model name + LLM ответ
│                          trace.score(): match_score, seniority_confidence, latency_s, skills_missing_count
│                          output + metadata: vacancy_seniority_hint (для анализа penalty)
│
├── ml/
│   ├── skill_extractor.py  ← BERT NER: вспомогательное извлечение навыков (supplement)
│   │                          фильтрует ## subword-артефакты (мусор на русском тексте)
│   ├── skill_matcher.py    ← двухэтапный matching: exact norm → BAAI/bge cosine similarity
│   │                          merge_skills(primary, supplement) — LLM первичный, NER дополняет
│   │                          match_skills(resume, vacancy) → (found, missing, score)
│   │                          threshold из settings.skill_match_threshold (SKILL_MATCH_THRESHOLD .env)
│   └── seniority_clf.py    ← DistilBERT + LoRA: junior / middle / senior
│
├── rag/
│   ├── embeddings.py  ← синглтоны моделей (dense BAAI + sparse BM42)
│   ├── indexer.py     ← записать вакансию в Qdrant (upsert)
│   └── retriever.py   ← hybrid search RRF, возвращает top-k вакансий
│
├── clients/
│   ├── browser_pool.py      ← shared Playwright browser (singleton на весь lifecycle сервера)
│   │                           get_page() — context manager, изолированный context на запрос
│   │                           fallback: ephemeral browser если pool не инициализирован
│   ├── hh_client.py         ← get_vacancy_by_url (официальный API + Playwright fallback)
│   │                           get_vacancy(id) — без auth, используется в seek enrich
│   ├── vacancy_search.py    ← VacancySearchProvider Protocol + реализации:
│   │                           HHPlaywrightSearchProvider — scrapes hh.ru search page
│   │                           HHOAuthSearchProvider     — api.hh.ru с токеном (stub)
│   │                           get_search_provider()     — фабрика (единая точка смены)
│   └── resume_parser.py     ← PDF → текст (PyMuPDF)
│                               get_text("blocks") + сортировка по позиции (multi-column fix)
│                               фильтрация шума: номера страниц, повторяющиеся шапки
│
└── db/
    ├── models.py      ← PostgreSQL: User + Session + Analysis (SQLAlchemy async)
    └── session.py     ← AsyncSession factory (get_session Depends)
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

## Auth — JWT + bcrypt

```python
# api/auth/jwt.py — bcrypt напрямую, без passlib
# (passlib несовместима с bcrypt >= 4.x — упадёт с AttributeError на __about__.__version__)
import bcrypt

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())

def create_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode({"sub": str(user_id), "exp": expire}, settings.jwt_secret, ...)
```

```python
# api/auth/deps.py — как middleware в Express, но декларативно через Depends
_bearer = HTTPBearer(auto_error=False)

# Опциональная авторизация — для /api/analyze (анализ работает и без аккаунта)
async def current_user_optional(credentials=Depends(_bearer), db=Depends(get_session)) -> User | None:
    ...

# Обязательная авторизация — для /api/history, /api/analyses/{id}
async def current_user_required(user=Depends(current_user_optional)) -> User:
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user
```

**Почему `current_user_optional` для `/api/analyze`?**  
Анализ должен работать и для неавторизованных пользователей. Если токен есть — `Session.user_id` заполняется, анализ попадает в историю.

---

## gap_node — auto-indexing

Каждая проанализированная вакансия автоматически добавляется в Qdrant:

```python
# gap.py — fire-and-forget после извлечения навыков
asyncio.create_task(_auto_index_vacancy(vacancy_text, title, vacancy_skills))
```

- `vacancy_id` = MD5-хэш текста вакансии (идемпотентно — одна и та же вакансия не дублируется)
- `title` = `vacancy_summary` из parse_node (первые 120 символов)
- Ошибки не блокируют анализ — логируются как DEBUG

**Эффект:** база знаний растёт органически из пользовательского поведения, покрывает любые специализации без ручного запуска скриптов.

---

## VacancySearchProvider — абстракция поиска

```python
# api/clients/vacancy_search.py — Open/Closed principle
class VacancySearchProvider(Protocol):
    async def search(self, filters: SearchFilters) -> list[VacancyItem]: ...

def get_search_provider() -> VacancySearchProvider:
    return HHPlaywrightSearchProvider()
    # return HHOAuthSearchProvider()   # после регистрации app hh.ru
```

**Seek flow (api/routes/seek.py):**
1. `HHPlaywrightSearchProvider.search()` — Playwright открывает страницу поиска, JS evaluate достаёт карточки (id, title, company, address, exp)
2. **Enrich** — для каждой карточки параллельно вызывается `get_vacancy(id)` через официальный API (без auth) → полный текст + key_skills + зарплата. Семафор 5 — не ддосим hh.ru
3. Теперь `item.text` содержит полное описание → `gap_node` видит реальные требования → `match_score` ненулевой

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

# 4. Заполнить .env (скопировать из .env.example, добавить OPENAI_API_KEY + JWT_SECRET)
cp .env.example .env

# 5. Применить миграции БД (создаёт таблицы users, добавляет role к существующим)
alembic upgrade head

# 6. Наполнить Qdrant вакансиями с hh.ru
python -m scripts.index_vacancies

# 7. Запустить сервер (= nodemon / node index.js)
uvicorn api.main:app --reload --port 8000

# 8. Swagger документация — бесплатно в FastAPI
# http://localhost:8000/docs
```
