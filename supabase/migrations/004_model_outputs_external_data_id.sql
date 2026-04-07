-- Link each model output to the weather snapshot used for features (audit + joins).
ALTER TABLE model_outputs
  ADD COLUMN IF NOT EXISTS external_data_id UUID REFERENCES external_data_snapshots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_model_outputs_external_data
  ON model_outputs(external_data_id);
