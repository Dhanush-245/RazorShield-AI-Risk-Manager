# IEEE-CIS fraud candidate v1

## Intended use

Offline/candidate scoring of rows that satisfy the IEEE-CIS feature contract. 
The artifact is not approved for automatic financial action.

## Evaluation

- Temporal locked-test rows: 88,581
- PR-AUC: 0.476251
- ROC-AUC: 0.891821
- Precision: 0.495559
- Recall: 0.434317
- F1: 0.462921
- False-positive rate: 0.015942

## Thresholds

- Medium-risk threshold: 0.045028
- High-risk/review threshold: 0.240867
- Alternate cost-sensitive threshold: 0.021144

## Limitations

- IEEE-CIS fields are anonymized and do not directly match the ordinary merchant API.
- Identity coverage in the audited training data is 24.42%.
- Cost assumptions are illustrative and require merchant approval.
- TreeSHAP explains the uncalibrated model margin; probability is calibrated afterward.
- Human review is required before consequential action.
