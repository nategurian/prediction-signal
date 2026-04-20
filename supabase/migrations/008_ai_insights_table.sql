-- ai_insights: aggregated AI-generated synthesis rows.
-- `kind` future-proofs for drift_alert and tuning_proposal rows in later specs.
-- `aggregates` stores the exact JSON fed to the LLM for auditability and
-- prompt-regression replays.

CREATE TABLE ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  sample_size INTEGER NOT NULL,
  narrative TEXT NOT NULL,
  headline TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('improving','stable','degrading','insufficient_data')),
  top_failure_modes JSONB NOT NULL DEFAULT '[]'::jsonb,
  top_proposals JSONB NOT NULL DEFAULT '[]'::jsonb,
  tuning_clusters JSONB NOT NULL DEFAULT '[]'::jsonb,
  aggregates JSONB NOT NULL,
  model_version TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  generated_by TEXT NOT NULL CHECK (generated_by IN ('cron','manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_insights_kind_window ON ai_insights (kind, window_end DESC);

-- Cron rows are unique per (kind, window). Manual rows can repeat.
CREATE UNIQUE INDEX idx_ai_insights_cron_uniq
  ON ai_insights (kind, window_start, window_end)
  WHERE generated_by = 'cron';
