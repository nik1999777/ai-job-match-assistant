import hashlib

from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance,
    PointStruct,
    SparseVector,
    SparseVectorParams,
    VectorParams,
)

from api.rag.embeddings import DENSE_DIM, get_dense_embedder, get_sparse_embedder
from api.settings import settings


async def ensure_collection(client: AsyncQdrantClient) -> None:
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
    url: str | None = None,
    company: str = "",
    salary_str: str | None = None,
) -> None:
    dense_vec = list(get_dense_embedder().embed([text]))[0].tolist()
    sparse_result = list(get_sparse_embedder().embed([text]))[0]

    if vacancy_id.isdigit():
        point_id = int(vacancy_id)
    else:
        point_id = int(hashlib.md5(vacancy_id.encode()).hexdigest(), 16) % (2 ** 31)

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
                    "company": company,
                    "skills": skills,
                    "text_preview": text[:500],
                    "url": url,
                    "salary_str": salary_str,
                },
            )
        ],
    )
