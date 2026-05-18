"""
Shared embedding model instances for RAG layer.

Both indexer and retriever import from here so models are loaded once per process.
fastembed downloads model weights on first embed() call, not on instantiation.
"""
from fastembed import TextEmbedding, SparseTextEmbedding

DENSE_MODEL = "BAAI/bge-small-en-v1.5"   # 384-dim, ~33M params
SPARSE_MODEL = "Qdrant/bm42-all-minilm-l6-v2-attentions"  # BM42 sparse

DENSE_DIM = 384

dense_embedder = TextEmbedding(DENSE_MODEL)
sparse_embedder = SparseTextEmbedding(SPARSE_MODEL)
