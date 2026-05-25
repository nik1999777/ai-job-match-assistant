# Eval — Архитектура оценки качества

---

## Зачем eval pipeline

В production AI системах нельзя деплоить изменения промптов/моделей без проверки качества.  
Eval pipeline позволяет объективно измерить: стало лучше или хуже?

Это прямое требование вакансии hh.ru AI Lab:
> *"опыт тестирования и регресс-проверок промптов, понимание подходов к оценке LLM-систем"*

---

## Структура

```
eval/
├── run_eval.py       ← запускает прогон, сохраняет результаты, regression comparison, MLflow
├── judge.py          ← LLM-as-a-judge: GPT-4o-mini оценивает наш вывод
├── metrics.py        ← offline метрики: advice_similarity, Rouge-L, skill recall/precision/F1, MAE
├── dataset.py        ← 12 тестовых пар + референсные ответы
├── results/
│   └── eval_YYYY-MM-DD.jsonl  ← история прогонов
└── EVAL.md           ← этот файл
```

---

## Три уровня оценки

### 1. Offline метрики (`metrics.py`)

Быстрые, дешёвые, без LLM-вызовов. Запускаются на каждом PR как первичный фильтр.

| Метрика | Описание | Цель |
|---|---|---|
| `match_score_in_range` | score попал в ожидаемый диапазон | > 80% |
| `match_score_mae` | отклонение от диапазона (0 = идеал) | < 0.1 |
| `skill_recall` | доля найденных пробелов из ожидаемых (sensitivity) | > 0.8 |
| `skill_precision` | доля верных предсказаний среди всех предсказанных (без ложных тревог) | > 0.7 |
| `skill_f1` | гармоническое среднее recall и precision | > 0.7 |
| `advice_similarity` | косинусное сходство BAAI/bge эмбеддингов совета и референса | основная метрика качества текста |
| `rouge_l` | n-gram сходство текстов — вспомогательная | информационная |
| `latency_ms` | время выполнения pipeline на кейс | < 5000ms |

### 2. LLM-as-a-judge (`judge.py`)

GPT-4o-mini оценивает вывод нашей системы по 4 критериям (1–5).  
Стандарт в современных AI системах: дешевле human eval, но высоко коррелирует с ним.

| Критерий | Что проверяет |
|---|---|
| `relevance` | Совет релевантен конкретной паре резюме/вакансия |
| `actionability` | Конкретные шаги или пустые общие слова |
| `accuracy` | Правильно ли выявлены пробелы в навыках |
| `faithfulness` | Нет ли галлюцинаций — всё ли сказанное есть в текстах |

### 3. Regression comparison

При каждом запуске runner автоматически загружает предыдущий JSONL из `results/`  
и показывает дельту по каждой метрике:

```
Skill recall    : 0.720  (✓ +0.109 vs baseline)
Skill precision : 0.540  (⚠ -0.230 vs baseline)
```

---

## Тестовый датасет (`dataset.py`)

12 кейсов, покрывающих ключевые сценарии:

| # | Описание | Expected match | Difficulty |
|---|---|---|---|
| 1 | Python backend → ML Engineer | 0.10–0.40 | partial match |
| 2 | Senior Frontend → Senior Frontend | 0.60–1.00 | strong match |
| 3 | Junior → Senior Full-Stack | 0.20–0.60 | seniority gap (-20% penalty) |
| 4 | DevOps/SRE → DevOps | 0.65–0.95 | strong match, semantic (GitLab CI ≈ GitLab) |
| 5 | Data Analyst → Data Scientist | 0.10–0.45 | missing ML libs |
| 6 | Full-stack Python/React → Python Backend | 0.60–0.90 | good match |
| 7 | UX Designer → ML Engineer | 0.00–0.10 | completely irrelevant |
| 8 | Russian ML Engineer → LLM Engineer (RU) | 0.35–0.90 | Russian resume + seniority penalty |
| 9 | Middle Python Backend → Senior Backend | 0.40–0.85 | good skill match, seniority gap (-10%) |
| 10 | Junior ML student → ML Engineer middle | 0.05–0.30 | missing production stack |
| 11 | Russian Senior Frontend → Senior Frontend (RU) | 0.55–1.00 | full Russian case, strong match |
| 12 | Python Backend → Frontend React | 0.00–0.20 | career change, poor match |

---

## Запуск

```bash
# Prerequisite: docker-compose up -d postgres qdrant + uvicorn запущен

# Offline метрики (без LLM, бесплатно, ~2 мин на Ollama)
python -m eval.run_eval

# + LLM-as-a-judge (требует OPENAI_API_KEY в .env, ~5 мин)
python -m eval.run_eval --judge
```

Пример вывода:

```
=================================================================
EVAL SUMMARY  (12 cases, 2026-05-25)
=================================================================
  Match score in range : 10/12  (83%)
  Match score MAE      : 0.017
  Seniority accuracy   : 5/12  (42%)  ← цель LoRA: > 80%

  Skill recall         : 0.917
  Skill precision      : 0.501
  Skill F1             : 0.543
  Advice similarity    : 0.787
  Rouge-L (advice)     : 0.108
  Avg latency          : 13067 ms (Ollama; OpenAI ~2–3s)
=================================================================
```

---

## Решённые проблемы

| Проблема | Было | Стало | Решение |
|---|---|---|---|
| Ложные тревоги навыков | precision=0.056 | precision=0.501 | LLM-primary + NER-supplement; фильтр ## subword-токенов |
| Точность сопоставления | MAE=0.119 | MAE=0.017 | semantic matching BAAI/bge + seniority penalty |
| Seniority игнорировался в score | score=1.0 для junior→senior | penalty -20% | _seniority_penalty() в gap_node |
| Бесполезная метрика текста | rouge_l=0.031 | advice_similarity=0.787 | косинусное сходство эмбеддингов вместо n-gram overlap |
| Язык ответа | иногда English на RU резюме | всегда правильный | detect_language() → {language} в промпт |

## Известные ограничения (цели для LoRA)

| Проблема | Метрика | Причина |
|---|---|---|
| Seniority accuracy 42% | seniority_correct=5/12 | zero-shot xlm-roberta — нет fine-tuning на наших данных |
| Precision=0 на perfect-match кейсах | кейсы #4, #6, #11 | LLM (Ollama) предсказывает лишние "пробелы" когда expected_missing=[] |

---

## MLflow (experiment tracking)

Каждый прогон eval автоматически логируется в MLflow. Для просмотра:

```bash
mlflow ui --port 5001
# открываешь http://localhost:5001
```

Показывает историю всех runs, графики метрик по времени, сравнение runs между собой.

## Langfuse (LLM трейсинг)

Локальный аналог LangSmith. Трейсит каждый LLM вызов: ноды pipeline, токены, latency.

```bash
# Запустить
docker compose up -d langfuse
# Открыть http://localhost:3000 → зарегистрироваться → Settings → API Keys
```

```env
# .env — вставить ключи из Langfuse UI
LANGFUSE_HOST=http://localhost:3000
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
```

После этого каждый запрос к `/api/analyze`, `/api/seek`, `/api/batch`  
автоматически появляется в Langfuse с breakdown по нодам `parse → gap → advise`.

---

## Статус

| Файл | Статус |
|---|---|
| `eval/dataset.py` | ✅ 12 тестовых пар (RU, irrelevant, seniority gap, career change) |
| `eval/metrics.py` | ✅ advice_similarity, Rouge-L, skill recall/precision/F1, MAE, latency |
| `eval/judge.py` | ✅ GPT-4o-mini, 4 критерия (relevance/actionability/accuracy/faithfulness) |
| `eval/run_eval.py` | ✅ CLI, latency tracking, regression comparison, MLflow logging, JSONL |
| `eval/results/` | ✅ eval_2026-05-21.jsonl, eval_2026-05-22.jsonl, eval_2026-05-25.jsonl |
