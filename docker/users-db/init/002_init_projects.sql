CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  lead TEXT NOT NULL,
  region TEXT NOT NULL,
  status TEXT NOT NULL,
  budget NUMERIC(18,2) NOT NULL DEFAULT 0,
  spent NUMERIC(18,2) NOT NULL DEFAULT 0,
  start_date DATE NULL,
  end_date DATE NULL,
  priority TEXT NULL,
  financing_type TEXT NULL,
  tags TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_region ON projects(region);