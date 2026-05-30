# ML — Архитектура обучения моделей

---

## Что здесь

Папка `ml/` содержит скрипты для **обучения** моделей.  
Обученные веса используются в `api/ml/` во время инференса.

```
ml/
├── train_ner.py          ← fine-tuning BERT для NER (навыки)         [📅 следующий блок]
├── train_seniority.py    ← обучение DistilBERT + LoRA (уровень)      [📅 следующий блок]
├── data/
│   ├── seniority_dataset.jsonl ← 90 seed примеров: 30×junior/middle/senior
│   └── ner_dataset.jsonl       ← 63 BIO-tagged примера (B-SKILL/I-SKILL/O)
├── models/               ← сохранённые веса после fine-tuning         [📅 следующий блок]
├── scripts/
│   └── generate_dataset.py ← расширение датасетов через OpenAI GPT-4o-mini
└── ML.md                 ← этот файл
```

---

## Модель 1 — Skill Extractor (NER)

**Задача:** найти технические навыки в тексте резюме/вакансии.

```
Вход:  "Опыт: Python, FastAPI, PostgreSQL. Работал с Docker и Kubernetes."
Выход: ["Python", "FastAPI", "PostgreSQL", "Docker", "Kubernetes"]
```

**Подход:**

```
Базовая модель: dslim/bert-base-NER  (уже обучена на общих NER данных)
Fine-tuning:   на нашем датасете tech skills
Pipeline:      HuggingFace pipeline("ner", aggregation_strategy="simple")
```

**Формат датасета** (`data/ner_dataset.jsonl`):
```json
{"tokens": ["Python", "и", "FastAPI", "разработчик"], "labels": ["B-SKILL", "O", "B-SKILL", "O"]}
{"tokens": ["3", "года", "PyTorch", "опыта"], "labels": ["O", "O", "B-SKILL", "O"]}
```

**Fallback:** если модель не загружена или возвращает пустой список → gap_node берёт навыки из LLM-парсинга (parse_node).

---

## Модель 2 — Seniority Classifier (LoRA)

**Задача:** определить уровень кандидата по тексту резюме.

```
Вход:  "3 года опыта Python, FastAPI. Разработал 2 микросервиса..."
Выход: ("middle", 0.87)   ← label + confidence
```

**Текущий подход (без датасета):**

```
Модель:   joeddav/xlm-roberta-large-xnli  (multilingual NLI)
Метод:    zero-shot-classification pipeline
Гипотеза: "This resume belongs to a {junior|middle|senior} software engineer."
Плюс:     работает с русским текстом без обучения
```

**Финальный подход (следующий блок — данные уже готовы):**

```
Базовая модель: distilbert-base-uncased  (66M параметров)
Адаптер:        LoRA rank=16  (~1% параметров обучаем, 99% заморожены)
Классы:         junior | middle | senior
Датасет:        90 seed примеров в ml/data/seniority_dataset.jsonl
                + генерация до 500+ через ml/scripts/generate_dataset.py
```

**Текущий результат zero-shot:** seniority_accuracy = 42% (5/12 eval кейсов)  
**Цель после LoRA:** > 80%

**Почему LoRA?**  
Full fine-tuning DistilBERT требует обновления всех 66M параметров.  
LoRA добавляет маленькие матрицы (rank=16) поверх attention слоёв.  
Обучаем только ~600K параметров вместо 66M → в 100x быстрее, меньше памяти.  
Это стандарт для production fine-tuning под конкретную задачу.

**Формат датасета** (`data/seniority_dataset.jsonl`):
```json
{"text": "1 год опыта, Junior developer, первый проект...", "label": "junior"}
{"text": "5 лет Python, FastAPI, team lead, архитектура...", "label": "senior"}
```

**Расширение датасета:**
```bash
# Сгенерировать ещё 150 примеров (по 50 на каждый класс)
python -m ml.scripts.generate_dataset --task seniority --n 150

# Только junior
python -m ml.scripts.generate_dataset --task seniority --n 50 --label junior

# Статистика текущего датасета
python -m ml.scripts.generate_dataset --task stats
```

---

## Статус

| Файл | Статус |
|---|---|
| `api/ml/skill_extractor.py` | ✅ auto-loads fine-tuned NER (F1=0.97), fallback dslim/bert-base-NER |
| `api/ml/skill_matcher.py` | ✅ exact norm + BAAI/bge cosine, configurable threshold |
| `api/ml/seniority_clf.py` | ✅ auto-loads fine-tuned DistilBERT (100%), fallback zero-shot xlm-roberta |
| `ml/data/seniority_dataset.jsonl` | ✅ 90 seed примеров (30×junior/middle/senior), RU+EN, 17 доменов |
| `ml/data/ner_dataset.jsonl` | ✅ 63 BIO-tagged примера |
| `ml/scripts/generate_dataset.py` | ✅ LLM-генерация через GPT-4o-mini, дедупликация, валидация |
| `ml/train_ner.py` | ✅ dslim/bert-base-NER fine-tuned, precision/recall/F1=0.97, aggregation_strategy=first |
| `ml/train_seniority.py` | ✅ DistilBERT-multilingual + LoRA rank=16, accuracy=100% (42% zero-shot → 100%) |
