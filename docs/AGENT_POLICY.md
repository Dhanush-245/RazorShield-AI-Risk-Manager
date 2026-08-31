# Agent policy

The investigator may load a merchant-owned transaction, stored risk signals, related entities, active policies, and create a review recommendation. Those five tool calls are allowlisted and persisted. It may not change a payment, issue a refund, block an account, contact a customer, submit chargeback evidence, alter a model/policy, or access another merchant.

Every run records requester, case, status, recommendation, limitations, tool summaries, and an audit event. Output must label facts, inferences, missing information, recommendation, confidence, and limitations. A human reviewer is the approval boundary for consequential action.
