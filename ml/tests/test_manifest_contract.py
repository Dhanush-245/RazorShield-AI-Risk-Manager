import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_deployed_manifest_contains_evaluation_and_cost_governance() -> None:
    manifest = json.loads((ROOT / "ml" / "artifacts" / "manifest.json").read_text())

    assert manifest["dataset"]["split"] == "temporal_60_20_20"
    assert manifest["dataset"]["held_out_rows"] > 0
    for model_name in ("fraud", "anomaly", "fusion", "return"):
        metrics = manifest[model_name]["metrics"]
        assert {
            "precision",
            "recall",
            "f1",
            "pr_auc",
            "roc_auc",
            "confusion_matrix",
        } <= set(metrics)

    cost = manifest["fusion"]["business_cost_analysis"]
    assert cost["validation_at_cost_threshold"]["total_cost_inr"] >= 0
    assert cost["locked_test_at_f1_threshold"]["total_cost_inr"] >= 0
    assert cost["locked_test_at_cost_threshold"]["total_cost_inr"] >= 0
    assert cost["locked_test_always_allow_baseline"]["total_cost_inr"] >= 0
    assert "not claimed prevented loss" in cost["limitation"]
