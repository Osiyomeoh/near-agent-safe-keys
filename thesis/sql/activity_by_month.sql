-- Context for the key counts: monthly transactions and active signers, Mar-Oct 2026.
SELECT DATE_TRUNC(block_date, MONTH) AS month,
  COUNT(*) AS transactions,
  COUNT(DISTINCT signer_account_id) AS active_signers
FROM `bigquery-public-data.crypto_near_mainnet_us.transactions`
WHERE block_date BETWEEN '2026-03-01' AND '2026-10-31'
GROUP BY month ORDER BY month
