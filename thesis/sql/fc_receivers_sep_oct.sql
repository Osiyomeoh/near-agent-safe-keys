-- Which contracts the new function-call keys point at (Sep-Oct 2026), with 3 sample
-- receipt ids per receiver so anyone can check them on chain with no account (verify.mjs).
SELECT
  JSON_VALUE(args, '$.access_key.permission.FunctionCall.receiver_id') AS fc_receiver,
  COUNT(*) AS fc_keys,
  COUNT(DISTINCT receipt_receiver_account_id) AS accounts,
  ARRAY_AGG(receipt_id ORDER BY FARM_FINGERPRINT(receipt_id) LIMIT 3) AS sample_receipts
FROM `bigquery-public-data.crypto_near_mainnet_us.receipt_actions`
WHERE block_date BETWEEN '2026-09-01' AND '2026-10-31'
  AND action_kind = 'ADD_KEY'
  AND JSON_QUERY(args, '$.access_key.permission.FunctionCall') IS NOT NULL
GROUP BY fc_receiver
ORDER BY fc_keys DESC
LIMIT 40
