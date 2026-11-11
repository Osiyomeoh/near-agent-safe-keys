-- H2: how NEAR accounts hand out keys, by month.
-- receipt_actions.args for ADD_KEY is the AddKey action JSON (see near/near-public-lakehouse,
-- src/lakehouse/notebooks/Silver Lake Mainnet.sql, silver_action_receipt_actions).
-- Filtered on block_date, the partition column, to keep the scan small.
SELECT
  DATE_TRUNC(block_date, MONTH) AS month,
  COUNTIF(action_kind = 'ADD_KEY' AND JSON_VALUE(args, '$.access_key.permission') = 'FullAccess') AS add_key_full_access,
  COUNTIF(action_kind = 'ADD_KEY' AND JSON_QUERY(args, '$.access_key.permission.FunctionCall') IS NOT NULL) AS add_key_function_call,
  COUNTIF(action_kind = 'CREATE_ACCOUNT') AS create_account_actions,
  COUNT(DISTINCT IF(action_kind = 'ADD_KEY' AND JSON_QUERY(args, '$.access_key.permission.FunctionCall') IS NOT NULL,
        JSON_VALUE(args, '$.access_key.permission.FunctionCall.receiver_id'), NULL)) AS distinct_fc_receivers
FROM `bigquery-public-data.crypto_near_mainnet_us.receipt_actions`
WHERE block_date BETWEEN '2026-01-01' AND '2026-10-31'
  AND action_kind IN ('ADD_KEY', 'CREATE_ACCOUNT')
GROUP BY month
ORDER BY month
