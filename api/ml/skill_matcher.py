"""
Skill matching with two-stage strategy:
  1. Exact normalized match  — fast, no model inference
  2. Semantic match via cosine similarity — catches synonyms and aliases
"""
from __future__ import annotations

import logging
import re
from functools import cache

import numpy as np

logger = logging.getLogger(__name__)

# Strips whitespace and common separators; preserves + and # (C++, C#)
_NORM_RE = re.compile(r"[\s.\-_/]")

SIMILARITY_THRESHOLD = 0.75


def _normalize(skill: str) -> str:
    return _NORM_RE.sub("", skill.lower())


@cache
def _get_embed_model():
    from fastembed import TextEmbedding
    return TextEmbedding("BAAI/bge-small-en-v1.5")


def _embed(texts: list[str]) -> np.ndarray:
    return np.array(list(_get_embed_model().embed(texts)), dtype=np.float32)


def merge_skills(primary: list[str], supplement: list[str]) -> list[str]:
    """LLM-parsed skills as base; NER-extracted as supplement. Dedup by normalized form."""
    seen: set[str] = {_normalize(s) for s in primary}
    result = list(primary)
    for skill in supplement:
        key = _normalize(skill)
        if key and key not in seen:
            seen.add(key)
            result.append(skill)
    return result


def match_skills(
    resume_skills: list[str],
    vacancy_skills: list[str],
    threshold: float = SIMILARITY_THRESHOLD,
) -> tuple[list[str], list[str], float]:
    """
    Return (found, missing, match_score).

    Stage 1 — exact normalized match (zero cost).
    Stage 2 — cosine similarity via BAAI/bge-small embeddings for unmatched skills.
              Catches: 'GitLab CI' ≈ 'GitLab', 'LoRA' ≈ 'fine-tuning', 'Postgres' ≈ 'PostgreSQL'.
    """
    if not vacancy_skills:
        return [], [], 0.0
    if not resume_skills:
        return [], list(vacancy_skills), 0.0

    # Stage 1: exact normalized match
    resume_by_norm = {_normalize(s): s for s in resume_skills}
    vacancy_by_norm = {_normalize(s): s for s in vacancy_skills}

    exact_hits = set(resume_by_norm) & set(vacancy_by_norm)
    found: list[str] = [resume_by_norm[k] for k in exact_hits]

    unmatched_vac = [vacancy_by_norm[k] for k in set(vacancy_by_norm) - exact_hits]
    unmatched_res = [resume_by_norm[k] for k in set(resume_by_norm) - exact_hits]

    # Stage 2: semantic match for remaining skills
    if unmatched_vac and unmatched_res:
        try:
            res_embs = _embed(unmatched_res)   # (R, D)
            vac_embs = _embed(unmatched_vac)   # (V, D)

            # Full cosine similarity matrix (V, R) in one vectorized operation
            sim = vac_embs @ res_embs.T
            sim /= (
                np.linalg.norm(vac_embs, axis=1, keepdims=True)
                * np.linalg.norm(res_embs, axis=1)
                + 1e-9
            )

            semantic_missing = []
            for i, vac_skill in enumerate(unmatched_vac):
                if sim[i].max() >= threshold:
                    found.append(vac_skill)
                else:
                    semantic_missing.append(vac_skill)
            missing = semantic_missing

        except Exception as exc:
            logger.warning("Semantic matching failed, using unmatched list: %s", exc)
            missing = unmatched_vac
    else:
        missing = unmatched_vac

    score = round(len(found) / max(len(vacancy_skills), 1), 3)
    return sorted(found), sorted(missing), score
