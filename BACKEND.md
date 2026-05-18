# Backend — Подробное объяснение для JS разработчика

> Ты знаешь JavaScript — значит 80% концепций тебе уже знакомы.
> Этот файл объясняет Python/FastAPI через то, что ты уже знаешь.

---

## 1. Структура проекта — что за что отвечает

```
api/
├── main.py                  ← точка входа (как index.js в Express)
├── settings.py              ← переменные окружения (как dotenv + config)
│
├── routes/                  ← роуты (как routes/ в Express)
│   ├── analyze.py           ← POST /api/analyze — главный эндпоинт
│   ├── batch.py             ← POST /api/batch   — пакетная обработка
│   └── health.py            ← GET  /health      — healthcheck
│
├── agents/                  ← LangGraph пайплайн (бизнес-логика)
│   ├── graph.py             ← собирает граф из узлов
│   └── nodes/
│       ├── parse.py         ← узел 1: LLM парсит резюме/вакансию в JSON
│       ├── gap.py           ← узел 2: ML анализ навыков + RAG поиск
│       └── advise.py        ← узел 3: LLM генерирует совет
│
├── llm/
│   ├── provider.py          ← фабрика: вернуть OpenAI или Ollama клиент
│   └── streaming.py         ← SSE стриминг из LangGraph
│
├── ml/
│   ├── skill_extractor.py   ← BERT NER: найти навыки в тексте
│   └── seniority_clf.py     ← DistilBERT+LoRA: junior/middle/senior
│
├── rag/
│   ├── embeddings.py        ← модели для векторизации текста
│   ├── indexer.py           ← записать вакансию в Qdrant
│   └── retriever.py         ← найти похожие вакансии в Qdrant
│
├── clients/
│   └── hh_client.py         ← HTTP клиент к hh.ru API
│
└── db/
    └── models.py            ← PostgreSQL таблицы (Session, Analysis)
```

---

## 2. Python vs JavaScript — ключевые различия

### Переменные и типы

```javascript
// JavaScript
const name = "Nikita"
let count = 0
```

```python
# Python — нет const/let, просто присваивание
name = "Nikita"
count = 0

# Type hints (необязательны, но мы используем — как TypeScript)
name: str = "Nikita"
count: int = 0
```

### Функции

```javascript
// JavaScript
function greet(name) {
  return `Hello ${name}`
}

// Стрелочная
const greet = (name) => `Hello ${name}`

// Async
async function fetchData() {
  const data = await fetch(url)
  return data.json()
}
```

```python
# Python
def greet(name: str) -> str:
    return f"Hello {name}"          # f-строки = template literals

# Async
async def fetch_data() -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(url)
        return resp.json()
```

### Объекты и словари

```javascript
// JavaScript — объект
const user = { name: "Nikita", age: 25 }
user.name          // доступ через точку
user["name"]       // доступ через скобки
```

```python
# Python — словарь (dict)
user = {"name": "Nikita", "age": 25}
user["name"]       # только через скобки
user.get("name")   # безопасно (не упадёт если нет ключа)
```

### Массивы и списки

```javascript
// JavaScript
const skills = ["python", "fastapi"]
skills.push("pytorch")
skills.map(s => s.toUpperCase())
skills.filter(s => s.length > 5)
```

```python
# Python — list
skills = ["python", "fastapi"]
skills.append("pytorch")
[s.upper() for s in skills]           # list comprehension = .map()
[s for s in skills if len(s) > 5]    # list comprehension = .filter()
```

### Классы

```javascript
// JavaScript
class Animal {
  constructor(name) {
    this.name = name
  }
  speak() {
    return `${this.name} makes a sound`
  }
}
```

```python
# Python
class Animal:
    def __init__(self, name: str):   # __init__ = constructor
        self.name = name             # self = this

    def speak(self) -> str:          # self всегда первый аргумент
        return f"{self.name} makes a sound"
```

### Декораторы — ключевая Python концепция

В Python `@` перед функцией — это **декоратор**. Он оборачивает функцию в другую функцию. Ты видишь их везде в FastAPI.

```python
# Декоратор = Higher Order Function в JS
@router.get("/health")          # ← это декоратор
async def health_check():
    return {"status": "ok"}

# То же самое без декоратора:
async def health_check():
    return {"status": "ok"}
health_check = router.get("/health")(health_check)  # некрасиво — поэтому @ синтаксис
```

В Express аналога нет, но концептуально похоже на middleware.

---

## 3. FastAPI — это Express для Python

| Express (JS) | FastAPI (Python) |
|---|---|
| `express()` | `FastAPI()` |
| `app.use(cors())` | `app.add_middleware(CORSMiddleware)` |
| `router.get('/path', handler)` | `@router.get('/path')` |
| `req.body` | параметр функции с типом Pydantic |
| `res.json({})` | `return {}` (FastAPI сам сериализует) |
| `next(err)` | `raise HTTPException(status_code=400)` |
| `app.listen(3000)` | `uvicorn api.main:app --port 8000` |

### Главный файл — `api/main.py`

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes import analyze, batch, health
from api.db.models import init_db
from api.settings import settings

# lifespan = аналог async function в Express перед app.listen()
# Запускается при старте сервера, yield = сервер работает, после yield = shutdown
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()   # создаём таблицы в PostgreSQL если не существуют
    yield             # ← сервер работает пока не остановят

app = FastAPI(title="AI Job Match Assistant", version="1.0.0", lifespan=lifespan)

# CORS — точно как в Express
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,   # ["http://localhost:5173"]
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключаем роуты (как app.use('/api', router) в Express)
app.include_router(health.router)
app.include_router(analyze.router)
app.include_router(batch.router)
```

### Роут — `api/routes/analyze.py`

```python
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["analyze"])
# prefix="/api" — все роуты этого роутера начинаются с /api
# tags=["analyze"] — для документации в /docs


# Pydantic BaseModel = TypeScript interface + runtime валидация (как Zod)
class AnalyzeRequest(BaseModel):
    resume: str                    # обязательное поле
    vacancy: str | None = None     # опциональное (None = undefined в JS)
    vacancy_url: str | None = None
    mode: str = "seeker"           # со значением по умолчанию


# Depends(get_session) = dependency injection
# FastAPI сам создаёт db-сессию и передаёт в функцию
# В Express ты бы сделал это через middleware
@router.post("/analyze")
async def analyze(
    body: AnalyzeRequest,              # FastAPI автоматически парсит JSON body
    db: AsyncSession = Depends(get_session),
) -> StreamingResponse:

    # Validation
    if not body.vacancy and not body.vacancy_url:
        raise HTTPException(status_code=422, detail="Provide vacancy or vacancy_url")
        # В Express: return res.status(422).json({ error: "..." })

    # Fetch vacancy from hh.ru if URL given
    if body.vacancy_url:
        vacancy_text, _ = await get_vacancy_by_url(body.vacancy_url)
    else:
        vacancy_text = body.vacancy

    # ... записываем в БД, запускаем граф ...

    # StreamingResponse = res.setHeader('Content-Type', 'text/event-stream') в Express
    return StreamingResponse(generate(), media_type="text/event-stream")
```

---

## 4. Settings — переменные окружения

```python
# api/settings.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Pydantic читает из .env файла автоматически
    # В JS: process.env.OPENAI_API_KEY || ""
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    database_url: str = "postgresql+asyncpg://..."
    qdrant_url: str = "http://localhost:6333"

settings = Settings()  # ← синглтон, импортируем везде
```

```bash
# .env файл (точно как в JS проектах)
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql+asyncpg://jobmatch:jobmatch@localhost:5432/jobmatch
```

---

## 5. База данных — `api/db/models.py`

В JS ты мог использовать Prisma или TypeORM. Здесь — SQLAlchemy (аналог).

```python
import uuid
from sqlalchemy import String, Float, Text, DateTime, ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession

# DeclarativeBase = базовый класс (как extends Model в Sequelize)
class Base(DeclarativeBase):
    pass

class Session(Base):
    __tablename__ = "sessions"     # имя таблицы в PostgreSQL

    # Mapped[str] — type hint для колонки
    # mapped_column(...) — настройки колонки
    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    mode: Mapped[str] = mapped_column(String, default="seeker")
    # relationship = JOIN (как include в Prisma)
    analyses: Mapped[list["Analysis"]] = relationship(back_populates="session")

class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[str] = mapped_column(String, primary_key=True, ...)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"))
    resume_text: Mapped[str] = mapped_column(Text)
    vacancy_text: Mapped[str] = mapped_column(Text)
    match_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    # ... остальные поля
```

### Как использовать в роуте

```python
# JavaScript (Prisma):
# const analysis = await prisma.analysis.create({ data: {...} })

# Python (SQLAlchemy async):
analysis = Analysis(session_id=session.id, resume_text=body.resume, ...)
db.add(analysis)           # как INSERT INTO но ещё не отправлено
await db.commit()          # теперь реально записывается в БД
await db.refresh(analysis) # перечитываем из БД (чтобы получить auto-generated поля)
```

---

## 6. LangGraph — граф вызовов функций

Представь это как **пайплайн из async функций**, где каждая получает общий объект (state) и возвращает его с новыми полями.

```javascript
// Концептуально в JS это выглядело бы так:
async function pipeline(input) {
  let state = { resume: input.resume, vacancy: input.vacancy }
  state = { ...state, ...await parseNode(state) }    // шаг 1
  state = { ...state, ...await gapNode(state) }      // шаг 2
  state = { ...state, ...await adviseNode(state) }   // шаг 3
  return state
}
```

```python
# В Python с LangGraph это выглядит так:
# api/agents/graph.py

from langgraph.graph import StateGraph, END
from api.agents.nodes.parse import parse_node
from api.agents.nodes.gap import gap_node
from api.agents.nodes.advise import advise_node

def build_graph():
    graph = StateGraph(JobMatchState)    # StateGraph = менеджер пайплайна

    # Регистрируем функции как узлы
    graph.add_node("parse_node", parse_node)
    graph.add_node("gap_node", gap_node)
    graph.add_node("advise_node", advise_node)

    # Определяем порядок выполнения
    graph.set_entry_point("parse_node")
    graph.add_edge("parse_node", "gap_node")
    graph.add_edge("gap_node", "advise_node")
    graph.add_edge("advise_node", END)

    return graph.compile()   # компилируем — теперь можно запускать
```

### Каждый узел — просто async функция

```python
# api/agents/nodes/parse.py

async def parse_node(state: dict) -> dict:
    # state — это общий объект пайплайна
    # Как аргумент middleware в Express, только передаётся явно

    llm = get_llm()           # получаем LLM клиент
    chain = PROMPT | llm      # | = pipe оператор (как pipe() в RxJS)
    result = await chain.ainvoke({"resume": state["resume"], ...})

    # Возвращаем обновлённый state (spread operator как в JS)
    return {**state, "parsed": json.loads(result.content)}
    # {**state} = {...state} в JS
```

---

## 7. SSE Streaming — как это работает

```
Клиент делает POST /api/analyze
Сервер НЕ закрывает соединение — шлёт события по мере готовности:

data: {"event": "node_start", "node": "parse_node"}

data: {"event": "node_done", "node": "parse_node"}

data: {"event": "node_start", "node": "gap_node"}

data: {"event": "node_done", "node": "gap_node"}

data: {"event": "token", "content": "## Overall"}
data: {"event": "token", "content": " Assessment"}
data: {"event": "token", "content": "\nYour match score..."}

data: {"event": "done", "state": {...}}
```

```python
# api/llm/streaming.py

async def event_stream(graph, resume, vacancy):
    # astream_events — LangGraph стримит события каждого шага
    async for event in graph.astream_events({"resume": resume, "vacancy": vacancy}, version="v2"):
        kind = event["event"]   # тип события

        if kind == "on_chat_model_stream":
            # Токен от LLM — шлём клиенту немедленно
            chunk = event["data"]["chunk"]
            data = json.dumps({"event": "token", "content": chunk.content})
            yield f"data: {data}\n\n".encode()
            # \n\n — обязательный разделитель в SSE протоколе
```

```javascript
// Как читать SSE на клиенте (EventSource или fetch):
const response = await fetch('/api/analyze', {
  method: 'POST',
  body: JSON.stringify({ resume, vacancy_url }),
  headers: { 'Content-Type': 'application/json' }
})

const reader = response.body.getReader()
const decoder = new TextDecoder()

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  const text = decoder.decode(value)
  // text = 'data: {"event": "token", "content": "## Overall"}\n\n'
  const lines = text.split('\n').filter(l => l.startsWith('data: '))
  for (const line of lines) {
    const data = JSON.parse(line.slice(6))  // убираем 'data: '
    if (data.event === 'token') {
      setAdvice(prev => prev + data.content) // стримим в UI
    }
  }
}
```

---

## 8. hh.ru API клиент — `api/clients/hh_client.py`

```python
# В JS ты бы написал:
# const resp = await fetch(`https://api.hh.ru/vacancies/${id}`)
# const data = await resp.json()

# В Python с httpx (аналог axios/fetch):
import httpx

async def get_vacancy(vacancy_id: str) -> dict:
    async with httpx.AsyncClient(headers=_HEADERS, timeout=10.0) as client:
        resp = await client.get(f"{HH_API_BASE}/vacancies/{vacancy_id}")
        resp.raise_for_status()   # как axios — бросает ошибку если status >= 400
        return resp.json()
```

hh.ru отдаёт описание вакансии в HTML. Мы его чистим:

```python
import re

_HTML_TAG_RE = re.compile(r"<[^>]+>")    # regex для HTML тегов

def vacancy_to_text(data: dict) -> str:
    raw_html = data.get("description", "")
    plain = _HTML_TAG_RE.sub(" ", raw_html)   # заменяем теги на пробел
    return plain.strip()

# В JS: desc.replace(/<[^>]+>/g, ' ').trim()
```

---

## 9. RAG — зачем и как

**RAG = Retrieval-Augmented Generation**

Проблема: LLM не знает конкретных вакансий на рынке прямо сейчас.  
Решение: перед генерацией совета находим 3 похожих вакансии из нашей базы и добавляем их в промпт.

```
1. Пользователь присылает вакансию "ML Engineer в Яндексе"
2. Мы ищем в Qdrant: 3 вакансии наиболее похожих на эту
3. Добавляем их в промпт advise_node:
   "Похожие вакансии на рынке требуют: X, Y, Z"
4. LLM даёт совет учитывая реальный рынок
```

```python
# api/rag/retriever.py — гибридный поиск

async def retrieve_similar_vacancies(query: str, top_k: int = 3) -> list[dict]:
    client = AsyncQdrantClient(url=settings.qdrant_url)

    # Векторизуем текст запроса
    dense_vec = list(dense_embedder.embed([query]))[0].tolist()
    sparse_vec = list(sparse_embedder.embed([query]))[0]

    # Hybrid search: dense (семантика) + sparse (ключевые слова) → RRF
    response = await client.query_points(
        collection_name="vacancies",
        prefetch=[
            Prefetch(query=dense_vec, using="dense", limit=15),
            Prefetch(query=SparseVector(...), using="sparse", limit=15),
        ],
        query=FusionQuery(fusion=Fusion.RRF),  # объединяем результаты
        limit=top_k,
    )

    return [{"title": p.payload["title"], "skills": p.payload["skills"]} for p in response.points]
```

---

## 10. Как запустить backend локально

```bash
# 1. Поднять инфраструктуру (PostgreSQL + Qdrant)
docker-compose up -d postgres qdrant

# 2. Создать виртуальное окружение (как node_modules, только для Python)
python3 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate

# 3. Установить зависимости (как npm install)
pip install -r requirements.txt

# 4. Создать .env (скопировать из .env.example)
cp .env.example .env
# отредактировать .env — добавить OPENAI_API_KEY

# 5. Наполнить Qdrant вакансиями с hh.ru
python -m scripts.index_vacancies

# 6. Запустить сервер (как node index.js или nodemon)
uvicorn api.main:app --reload --port 8000

# 7. Открыть интерактивную документацию API (Swagger — бесплатно в FastAPI!)
# http://localhost:8000/docs
```

---

## 11. Структура ответа API — что получает фронт

### POST /api/analyze

**Запрос:**
```json
{
  "resume": "Опыт работы: 3 года Python, FastAPI, PostgreSQL...",
  "vacancy_url": "https://hh.ru/vacancy/123456789",
  "mode": "seeker"
}
```

**Ответ (SSE поток):**
```
data: {"event": "node_start", "node": "parse_node"}

data: {"event": "node_done", "node": "parse_node"}

data: {"event": "node_start", "node": "gap_node"}

data: {"event": "node_done", "node": "gap_node"}

data: {"event": "node_start", "node": "advise_node"}

data: {"event": "token", "content": "## Overall Assessment\n"}
data: {"event": "token", "content": "Your match score is 40%..."}
... (много токенов)

data: {"event": "done", "state": {
  "match_score": 0.4,
  "seniority": "middle",
  "seniority_confidence": 0.87,
  "skills_found": ["python", "pytorch"],
  "skills_missing": ["langchain", "qdrant", "peft"],
  "llm_response": "## Overall Assessment\n..."
}}
```

### GET /health

```json
{
  "status": "ok",
  "db": "ok",
  "qdrant": "ok"
}
```

---

## 12. Частые ошибки для JS разработчика в Python

```python
# ❌ НЕПРАВИЛЬНО — забыл await
result = chain.ainvoke(...)          # возвращает корутину, не результат!

# ✅ ПРАВИЛЬНО
result = await chain.ainvoke(...)


# ❌ НЕПРАВИЛЬНО — в Python нет var/const/let
const name = "Nikita"   # SyntaxError

# ✅ ПРАВИЛЬНО
name = "Nikita"


# ❌ НЕПРАВИЛЬНО — отступы важны (Python использует их вместо {})
def greet():
return "hello"    # IndentationError

# ✅ ПРАВИЛЬНО
def greet():
    return "hello"   # 4 пробела


# ❌ НЕПРАВИЛЬНО — словари через точку не работают
user = {"name": "Nikita"}
print(user.name)    # AttributeError

# ✅ ПРАВИЛЬНО
print(user["name"])
print(user.get("name"))  # безопасно, не упадёт


# ❌ НЕПРАВИЛЬНО — None, не null
if result == null:  # NameError

# ✅ ПРАВИЛЬНО
if result is None:
if result is not None:
```
