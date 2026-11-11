SELECT action_kind, args, receipt_id FROM `bigquery-public-data.crypto_near_mainnet_us.receipt_actions` WHERE block_date='2026-10-15' AND action_kind='ADD_KEY' LIMIT 3
