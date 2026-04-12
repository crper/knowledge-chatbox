"""FTS5 virtual table definition for retrieval chunk full-text search."""

from sqlalchemy import Column, Integer, MetaData, String, Table

retrieval_chunks_fts_metadata = MetaData()

retrieval_chunks_fts = Table(
    "retrieval_chunks_fts",
    retrieval_chunks_fts_metadata,
    Column("generation", Integer),
    Column("chunk_id", String),
    Column("document_revision_id", Integer),
    Column("document_id", Integer),
    Column("space_id", Integer),
    Column("page_number", Integer),
    Column("section_title", String),
    Column("content", String),
)
