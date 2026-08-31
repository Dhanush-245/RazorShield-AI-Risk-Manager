from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.auth import Merchant
from app.models.risk import Transaction


@dataclass(frozen=True)
class ActiveDataset:
    id: str | None
    name: str
    activated_at: datetime | None


def get_active_dataset(db: Session, merchant_id: str) -> ActiveDataset:
    merchant = db.get(Merchant, merchant_id)
    if merchant is None or merchant.active_dataset_id is None:
        return ActiveDataset(id=None, name="Bundled demonstration data", activated_at=None)
    return ActiveDataset(
        id=merchant.active_dataset_id,
        name=merchant.active_dataset_name or "Uploaded dataset",
        activated_at=merchant.active_dataset_activated_at,
    )


def transaction_scope(db: Session, merchant_id: str) -> tuple[object, ...]:
    active = get_active_dataset(db, merchant_id)
    conditions: list[object] = [Transaction.merchant_id == merchant_id]
    if active.id is not None:
        conditions.append(Transaction.dataset_id == active.id)
    return tuple(conditions)
