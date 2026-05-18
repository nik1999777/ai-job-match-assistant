"""
Hybrid search over Qdrant vacancies collection.

Strategy: RRF (Reciprocal Rank Fusion) over dense + sparse results.
- Dense  → semantic similarity (synonym-aware)
- Sparse → BM42 keyword match (exact term recall)
- RRF    → combines both rankings without manual weight tuning
"""
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import Fusion, FusionQuery, Prefetch, SparseVector

from api.rag.embeddings import dense_embedder, sparse_embedder
from api.settings import settings


async def retrieve_similar_vacancies(
    query: str,
    top_k: int = 3,
) -> list[dict]:
    """
    Find top-k vacancies most similar to the given vacancy text.

    Returns list of dicts with keys: vacancy_id, title, skills, score.
    """
    client = AsyncQdrantClient(url=settings.qdrant_url)

    dense_vec = list(dense_embedder.embed([query]))[0].tolist()
    sparse_result = list(sparse_embedder.embed([query]))[0]

    # Prefetch more candidates than needed — RRF reranks and returns top_k
    prefetch_limit = top_k * 5

    response = await client.query_points(
        collection_name=settings.qdrant_collection,
        prefetch=[
            Prefetch(
                query=dense_vec,
                using="dense",
                limit=prefetch_limit,
            ),
            Prefetch(
                query=SparseVector(
                    indices=sparse_result.indices.tolist(),
                    values=sparse_result.values.tolist(),
                ),
                using="sparse",
                limit=prefetch_limit,
            ),
        ],
        query=FusionQuery(fusion=Fusion.RRF),
        limit=top_k,
    )

    return [
        {
            "vacancy_id": point.payload.get("vacancy_id", ""),
            "title": point.payload.get("title", ""),
            "skills": point.payload.get("skills", []),
            "score": point.score,
        }
        for point in response.points
    ]
