"""Fine-tune dslim/bert-base-NER on tech skill extraction.

Train: ml/data/ner_dataset.jsonl (63 BIO-tagged examples)
Model: ml/models/ner/
Run:   python -m ml.train_ner
"""
import json
import random
from pathlib import Path

import numpy as np
from transformers import (
    AutoTokenizer,
    AutoModelForTokenClassification,
    TrainingArguments,
    Trainer,
    DataCollatorForTokenClassification,
)
from datasets import Dataset

LABEL2ID = {"O": 0, "B-SKILL": 1, "I-SKILL": 2}
ID2LABEL = {v: k for k, v in LABEL2ID.items()}
BASE_MODEL = "dslim/bert-base-NER"
DATA_PATH = Path("ml/data/ner_dataset.jsonl")
OUTPUT_DIR = Path("ml/models/ner")


def _load_examples() -> list[dict]:
    with open(DATA_PATH) as f:
        return [json.loads(line) for line in f]


def _tokenize_and_align(examples: dict, tokenizer) -> dict:
    tokenized = tokenizer(
        examples["tokens"],
        is_split_into_words=True,
        truncation=True,
        max_length=128,
    )
    all_labels = []
    for i, labels in enumerate(examples["labels"]):
        word_ids = tokenized.word_ids(batch_index=i)
        label_ids = []
        prev_word_id = None
        for word_id in word_ids:
            if word_id is None:
                label_ids.append(-100)          # [CLS] / [SEP]
            elif word_id != prev_word_id:
                label_ids.append(LABEL2ID[labels[word_id]])
            else:
                label_ids.append(-100)          # non-first subword → ignore in loss
            prev_word_id = word_id
        all_labels.append(label_ids)
    tokenized["labels"] = all_labels
    return tokenized


def _compute_metrics(p) -> dict:
    predictions, labels = p
    predictions = np.argmax(predictions, axis=2)
    tp = fp = fn = 0
    for pred_seq, label_seq in zip(predictions, labels):
        for pred, label in zip(pred_seq, label_seq):
            if label == -100:
                continue
            pred_lbl = ID2LABEL[pred]
            true_lbl = ID2LABEL[label]
            if true_lbl != "O" and pred_lbl == true_lbl:
                tp += 1
            elif true_lbl != "O" and pred_lbl != true_lbl:
                fn += 1
            elif true_lbl == "O" and pred_lbl != "O":
                fp += 1
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
    return {"precision": round(precision, 4), "recall": round(recall, 4), "f1": round(f1, 4)}


def main() -> None:
    random.seed(42)
    examples = _load_examples()
    random.shuffle(examples)

    split = int(len(examples) * 0.85)
    train_raw, eval_raw = examples[:split], examples[split:]
    print(f"Dataset: {len(examples)} total | Train: {len(train_raw)} | Eval: {len(eval_raw)}")

    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
    model = AutoModelForTokenClassification.from_pretrained(
        BASE_MODEL,
        num_labels=len(LABEL2ID),
        id2label=ID2LABEL,
        label2id=LABEL2ID,
        ignore_mismatched_sizes=True,   # replaces base NER head (4 classes → 3)
    )

    def to_dataset(rows: list[dict]) -> Dataset:
        ds = Dataset.from_list([{"tokens": r["tokens"], "labels": r["labels"]} for r in rows])
        return ds.map(
            lambda x: _tokenize_and_align(x, tokenizer),
            batched=True,
            remove_columns=["tokens", "labels"],
        )

    train_ds = to_dataset(train_raw)
    eval_ds = to_dataset(eval_raw)

    args = TrainingArguments(
        output_dir=str(OUTPUT_DIR),
        num_train_epochs=10,
        per_device_train_batch_size=8,
        per_device_eval_batch_size=8,
        learning_rate=2e-5,
        weight_decay=0.01,
        eval_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=2,
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        greater_is_better=True,
        logging_steps=5,
        report_to="none",
        seed=42,
    )

    trainer = Trainer(
        model=model,
        args=args,
        train_dataset=train_ds,
        eval_dataset=eval_ds,
        tokenizer=tokenizer,
        data_collator=DataCollatorForTokenClassification(tokenizer),
        compute_metrics=_compute_metrics,
    )

    trainer.train()
    trainer.save_model(str(OUTPUT_DIR))
    tokenizer.save_pretrained(str(OUTPUT_DIR))
    print(f"\nSaved to {OUTPUT_DIR}")

    # Sanity check
    from transformers import pipeline
    ner = pipeline("ner", model=str(OUTPUT_DIR), aggregation_strategy="first")
    test = "Опыт работы с Python, FastAPI, PostgreSQL и Docker, Kubernetes"
    found = [e["word"] for e in ner(test) if e["entity_group"] == "SKILL"]
    print(f"\nSanity check input:  {test}")
    print(f"Extracted skills:    {found}")
    print(f"Expected:            ['Python', 'FastAPI', 'PostgreSQL', 'Docker', 'Kubernetes']")


if __name__ == "__main__":
    main()
