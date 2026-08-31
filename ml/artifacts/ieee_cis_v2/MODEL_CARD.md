# ieee-cis-xgboost-v2

## Intended use

Offline/candidate scoring of rows that satisfy the IEEE-CIS feature contract. 
The artifact is not approved for automatic financial action.

## Evaluation

- Temporal locked-test rows: 88,581
- PR-AUC: 0.536191
- ROC-AUC: 0.909001
- Precision: 0.503755
- Recall: 0.522219
- F1: 0.512821
- False-positive rate: 0.01855

## Thresholds

- Medium-risk threshold: 0.056651
- High-risk/review threshold: 0.151543
- Alternate cost-sensitive threshold: 0.02103

## Limitations

- IEEE-CIS fields are anonymized and do not directly match the ordinary merchant API.
- Identity coverage in the audited training data is 24.42%.
- Cost assumptions are illustrative and require merchant approval.
- Explanations use verified model-agnostic permutation SHAP on the final calibrated probability.
- Human review is required before consequential action.
