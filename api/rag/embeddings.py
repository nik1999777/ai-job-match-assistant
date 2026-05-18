from functools import cache

DENSE_MODEL = "BAAI/bge-small-en-v1.5"
SPARSE_MODEL = "Qdrant/bm42-all-minilm-l6-v2-attentions"
DENSE_DIM = 384


@cache
def get_dense_embedder():
    from fastembed import TextEmbedding
    return TextEmbedding(DENSE_MODEL)


@cache
def get_sparse_embedder():
    from fastembed import SparseTextEmbedding
    return SparseTextEmbedding(SPARSE_MODEL)
