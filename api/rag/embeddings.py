from fastembed import TextEmbedding, SparseTextEmbedding

DENSE_MODEL = "BAAI/bge-small-en-v1.5"
SPARSE_MODEL = "Qdrant/bm42-all-minilm-l6-v2-attentions"

DENSE_DIM = 384

dense_embedder = TextEmbedding(DENSE_MODEL)
sparse_embedder = SparseTextEmbedding(SPARSE_MODEL)
