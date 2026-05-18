# ML — Архитектура обучения моделей

---

## Что здесь

Папка `ml/` содержит скрипты для **обучения** моделей.  
Обученные веса используются в `api/ml/` во время инференса.

```
ml/
├── train_ner.py          ← fine-tuning BERT для NER (навыки)
├── train_seniority.py    ← обучение DistilBERT + LoRA (уровень)
├── data/
│   ├── ner_dataset.jsonl       ← размеченные примеры для NER
│   └── seniority_dataset.jsonl ← резюме с метками junior/middle/senior
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

**Финальный подход (Неделя 4, после сбора датасета):**

```
Базовая модель: distilbert-base-uncased  (66M параметров)
Адаптер:        LoRA rank=16  (~1% параметров обучаем, 99% заморожены)
Классы:         junior | middle | senior
```

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

---

## Статус

| Файл | Статус |
|---|---|
| `api/ml/skill_extractor.py` | ✅ dslim/bert-base-NER, lazy @cache |
| `api/ml/seniority_clf.py` | ✅ zero-shot xlm-roberta-large-xnli, multilingual |
| `ml/train_ner.py` | 📅 Неделя 4 |
| `ml/train_seniority.py` | 📅 Неделя 4 |
| `ml/data/` | 📅 Неделя 4 |
