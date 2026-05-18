"""
Qdrant indexer — stores vacancies as hybrid vectors (dense + sparse).

Dense  → BAAI/bge-small-en-v1.5 (384d, cosine) — semantic similarity
Sparse → BM42 (fastembed)                        — keyword exact match
"""
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance,
    PointStruct,
    SparseVector,
    SparseVectorParams,
    VectorParams,
)

from api.rag.embeddings import DENSE_DIM, dense_embedder, sparse_embedder
from api.settings import settings


async def ensure_collection(client: AsyncQdrantClient) -> None:
    """Create Qdrant collection if it does not exist yet."""
    existing = {c.name for c in (await client.get_collections()).collections}
    if settings.qdrant_collection in existing:
        return

    await client.create_collection(
        collection_name=settings.qdrant_collection,
        vectors_config={
            "dense": VectorParams(size=DENSE_DIM, distance=Distance.COSINE),
        },
        sparse_vectors_config={
            "sparse": SparseVectorParams(),
        },
    )


async def index_vacancy(
    client: AsyncQdrantClient,
    vacancy_id: str,
    title: str,
    text: str,
    skills: list[str],
) -> None:
    """
    Embed and upsert one vacancy into Qdrant.

    Uses upsert so re-running the script is idempotent.
    hh.ru vacancy IDs are numeric strings → store as int for Qdrant.
    """
    dense_vec = list(dense_embedder.embed([text]))[0].tolist()
    sparse_result = list(sparse_embedder.embed([text]))[0]

    point_id = int(vacancy_id) if vacancy_id.isdigit() else abs(hash(vacancy_id)) % (2 ** 31)

    await client.upsert(
        collection_name=settings.qdrant_collection,
        points=[
            PointStruct(
                id=point_id,
                vector={
                    "dense": dense_vec,
                    "sparse": SparseVector(
                        indices=sparse_result.indices.tolist(),
                        values=sparse_result.values.tolist(),
                    ),
                },
                payload={
                    "vacancy_id": vacancy_id,
                    "title": title,
                    "skills": skills,
                    # store first 500 chars as preview — full text is in PostgreSQL
                    "text_preview": text[:500],
                },
            )
        ],
    )
