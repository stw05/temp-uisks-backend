CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  position TEXT NULL,
  department TEXT NULL,
  region TEXT NULL,
  email TEXT NULL,
  phone TEXT NULL,
  h_index NUMERIC(10,2) NOT NULL DEFAULT 0,
  academic_degree TEXT NULL,
  scopus_author_id TEXT NULL,
  researcher_id_wos TEXT NULL,
  orcid TEXT NULL,
  gender TEXT NULL,
  citizenship TEXT NULL,
  project_role TEXT NULL,
  mrnti TEXT NULL,
  classifier TEXT NULL,
  project_ids TEXT NULL,
  excel_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_ref TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_region ON employees(region);
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);
CREATE INDEX IF NOT EXISTS idx_employees_excel_data_gin ON employees USING GIN (excel_data);
