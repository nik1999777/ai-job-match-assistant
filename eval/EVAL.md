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
├── run_eval.py       ← запускает прогон, сохраняет результаты
├── judge.py          ← LLM-as-a-judge: GPT-4 оценивает наш вывод
├── metrics.py        ← offline метрики: Rouge-L, BERTScore
├── dataset.py        ← тестовые пары + референсные ответы
├── results/
│   └── eval_YYYY-MM-DD.jsonl  ← история прогонов
└── EVAL.md           ← этот файл
```

---

## Три уровня оценки

### 1. Offline метрики (`metrics.py`)

Быстрые, дешёвые, без LLM-вызовов. Используются как первичный фильтр.

```python
# Rouge-L: насколько похож совет на референсный по длинным подпоследовательностям
rouge_score(generated_advice, reference_advice)   # 0.0 – 1.0

# Match score accuracy: насколько точно мы определяем overlap навыков
match_score_mae = abs(predicted_score - ground_truth_score)
```

### 2. LLM-as-a-judge (`judge.py`)

Берём сильную модель (GPT-4o) и просим оценить наш вывод по критериям.  
Это стандарт в современных AI системах — дешевле human eval, но коррелирует с ним.

```python
JUDGE_PROMPT = """
Оцени качество совета карьерного ассистента по критериям (1-5):

РЕЗЮМЕ: {resume}
ВАКАНСИЯ: {vacancy}
СОВЕТ АССИСТЕНТА: {advice}

Критерии:
- relevance: совет релевантен конкретной вакансии?
- actionability: можно ли прямо сейчас применить совет?
- accuracy: правильно ли выявлены пробелы в навыках?

Верни JSON: {"relevance": N, "actionability": N, "accuracy": N, "reasoning": "..."}
"""
```

### 3. Match score validation

Проверяем что наш match_score (из gap_node) совпадает с ground truth:
```
ground truth: HR эксперт вручную оценил пару резюме/вакансия → 0.65
наша система: gap_node вернул 0.61
MAE = |0.65 - 0.61| = 0.04  ← хорошо
```

---

## Тестовый датасет (`dataset.py`)

```python
TEST_CASES = [
    {
        "resume": "3 года Python, FastAPI, PostgreSQL. Без ML опыта.",
        "vacancy": "ML Engineer: Python, PyTorch, LangChain, Qdrant",
        "expected_match_range": (0.2, 0.4),   # ожидаем низкий score
        "expected_missing": ["pytorch", "langchain", "qdrant"],
        "expected_seniority": "middle",
        "reference_advice": "Сфокусируйся на PyTorch и LangChain..."
    },
    # ... ещё 20-30 пар
]
```

---

## Запуск

```bash
# Прогнать eval на всём датасете
python -m eval.run_eval

# Результат сохраняется в eval/results/eval_2026-05-18.jsonl
# Формат каждой записи:
{
  "test_id": 1,
  "rouge_l": 0.42,
  "match_score_mae": 0.05,
  "judge_relevance": 4,
  "judge_actionability": 3,
  "judge_accuracy": 4,
  "judge_reasoning": "Совет точно выявил gap по ML библиотекам..."
}
```

---

## Статус

| Файл | Статус |
|---|---|
| `eval/judge.py` | 📅 Неделя 3 |
| `eval/metrics.py` | 📅 Неделя 3 |
| `eval/dataset.py` | 📅 Неделя 3 |
| `eval/run_eval.py` | 📅 Неделя 3 |
