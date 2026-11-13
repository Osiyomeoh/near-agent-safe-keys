-- Out-of-sample check: function-call vs full-access keys added from 1 Nov 2026 to date.
SELECT COUNTIF(JSON_QUERY(args,'$.access_key.permission.FunctionCall') IS NOT NULL) AS add_key_function_call,
  COUNTIF(JSON_VALUE(args,'$.access_key.permission') = 'FullAccess') AS add_key_full_access,
  MAX(block_date) AS through
FROM `bigquery-public-data.crypto_near_mainnet_us.receipt_actions`
WHERE block_date >= '2026-11-01' AND action_kind = 'ADD_KEY'
