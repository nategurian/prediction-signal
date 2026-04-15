-- Add threshold_direction to distinguish "greater" vs "less" threshold markets.
-- Bucket markets and legacy rows without Kalshi strike_type leave this NULL.
ALTER TABLE markets
  ADD COLUMN threshold_direction text
  CHECK (threshold_direction IN ('greater', 'less'));

-- Backfill from raw_json for existing threshold markets.
UPDATE markets
SET threshold_direction = raw_json->>'strike_type'
WHERE market_structure = 'binary_threshold'
  AND raw_json->>'strike_type' IN ('greater', 'less');
