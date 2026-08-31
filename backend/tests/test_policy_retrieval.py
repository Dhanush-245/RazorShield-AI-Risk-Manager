from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database.base import Base
from app.models.governance import Policy
from app.services.policy_retrieval import retrieve_policies


def test_policy_retrieval_is_grounded_ranked_and_merchant_scoped() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add_all(
            [
                Policy(
                    merchant_id="merchant-a",
                    name="High-risk manual review policy",
                    version="2",
                    content="High risk transactions with verification failures require manual review.",
                ),
                Policy(
                    merchant_id="merchant-a",
                    name="Return policy",
                    version="1",
                    content="Returns may be accepted within thirty days with an order receipt.",
                ),
                Policy(
                    merchant_id="merchant-b",
                    name="Confidential escalation policy",
                    version="9",
                    content="High risk transactions require automatic escalation.",
                ),
                Policy(
                    merchant_id="merchant-a",
                    name="Inactive fraud policy",
                    version="0",
                    content="High risk fraud review.",
                    is_active=False,
                ),
            ]
        )
        db.commit()

        matches = retrieve_policies(db, "merchant-a", "high risk verification manual review")
        assert [item.name for item in matches] == ["High-risk manual review policy"]
        assert matches[0].score > 0
        assert retrieve_policies(db, "merchant-a", "quantum satellite telescope") == []
