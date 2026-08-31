import math
import re
from collections import Counter
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.governance import Policy


@dataclass(frozen=True)
class RetrievedPolicy:
    name: str
    version: str
    excerpt: str
    score: float


def terms(value: str) -> set[str]:
    return {word for word in re.findall(r"[a-z0-9]+", value.lower()) if len(word) > 2}


def retrieve_policies(db: Session, merchant_id: str, query: str, limit: int = 3) -> list[RetrievedPolicy]:
    query_tokens = re.findall(r"[a-z0-9]+", query.lower())
    query_terms = terms(query)
    if not query_terms or limit <= 0:
        return []
    policies = list(
        db.scalars(select(Policy).where(Policy.merchant_id == merchant_id, Policy.is_active.is_(True)))
    )
    documents = [terms(f"{policy.name} {policy.content}") for policy in policies]
    document_frequency = Counter(term for document in documents for term in document)
    ranked = []
    for policy, policy_terms in zip(policies, documents, strict=True):
        matched = query_terms & policy_terms
        if not matched:
            continue
        score = sum(
            query_tokens.count(term) * (math.log((len(documents) + 1) / (document_frequency[term] + 0.5)) + 1)
            for term in matched
        ) / max(len(query_tokens), 1)
        ranked.append(RetrievedPolicy(policy.name, policy.version, policy.content, round(score, 6)))
    return sorted(ranked, key=lambda item: item.score, reverse=True)[:limit]
