from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

MIN_RETRIEVAL_SOURCE_SCORE = 0.45
ATTACHMENT_SCOPED_QUERY_MULTIPLIER = 3


@dataclass(frozen=True, slots=True)
class RetrievalDiagnostics:
    """Structured retrieval diagnostics for prompt assembly logging."""

    strategy: str = "none"
    latency_ms: int = 0
    candidate_count: int = 0
    attachment_revision_scope_count: int = 0


@dataclass(frozen=True, slots=True)
class RetrievedContext:
    """Structured retrieval result for prompt assembly."""

    context_sections: list[str]
    sources: list[dict[str, Any]]
    diagnostics: RetrievalDiagnostics = field(default_factory=RetrievalDiagnostics)
