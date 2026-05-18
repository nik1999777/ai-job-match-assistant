from qdrant_client import AsyncQdrantClient
from qdrant_client.models import Fusion, FusionQuery, Prefetch, SparseVector

from api.rag.embeddings import dense_embedder, sparse_embedder
from api.settings import settings


async def retrieve_similar_vacancies(query: str, top_k: int = 3) -> list[dict]:
    client = AsyncQdrantClient(url=settings.qdrant_url)

    dense_vec = list(dense_embedder.embed([query]))[0].tolist()
    sparse_result = list(sparse_embedder.embed([query]))[0]

    response = await client.query_points(
        collection_name=settings.qdrant_collection,
        prefetch=[
            Prefetch(query=dense_vec, using="dense", limit=top_k * 5),
            Prefetch(
                query=SparseVector(
                    indices=sparse_result.indices.tolist(),
                    values=sparse_result.values.tolist(),
                ),
                using="sparse",
                limit=top_k * 5,
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
