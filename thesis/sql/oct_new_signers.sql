-- Who brought in October's 826,700 signers? For signers active in Oct but not in Sep, top receivers they called.
WITH oct AS (SELECT signer_account_id, receiver_account_id FROM `bigquery-public-data.crypto_near_mainnet_us.transactions` WHERE block_date BETWEEN '2026-10-01' AND '2026-10-31'),
sep AS (SELECT DISTINCT signer_account_id FROM `bigquery-public-data.crypto_near_mainnet_us.transactions` WHERE block_date BETWEEN '2026-09-01' AND '2026-09-30')
SELECT receiver_account_id, COUNT(DISTINCT o.signer_account_id) AS new_signers, COUNT(*) AS txs
FROM oct o LEFT JOIN sep s USING (signer_account_id) WHERE s.signer_account_id IS NULL
GROUP BY receiver_account_id ORDER BY new_signers DESC LIMIT 25
