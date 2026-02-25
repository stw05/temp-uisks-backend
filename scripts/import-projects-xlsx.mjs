#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import pg from "pg";
import xlsx from "xlsx";

const { Client } = pg;

const usage = () => {
  console.log("Usage: node scripts/import-projects-xlsx.mjs <path/to/project.xlsx> [--sheet <sheetName>] [--truncate]");
};

const args = process.argv.slice(2);
if (args.length === 0) {
  usage();
  process.exit(1);
}

const filePathArg = args[0];
let sheetName;
let truncate = false;

for (let index = 1; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--sheet") {
    sheetName = args[index + 1];
    index += 1;
    continue;
  }
  if (arg === "--truncate") {
    truncate = true;
  }
}

const filePath = path.resolve(process.cwd(), filePathArg);
if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

const env = {
  host: process.env.USERS_DB_HOST ?? "localhost",
  port: Number(process.env.USERS_DB_PORT ?? 5433),
  database: process.env.USERS_DB_NAME ?? "users_db",
  user: process.env.USERS_DB_USER ?? "users_admin",
  password: process.env.USERS_DB_PASSWORD ?? "users_password",
  table: process.env.USERS_PROJECTS_TABLE ?? "projects"
};

const normalize = (value) => String(value ?? "").toLowerCase().trim();
const toStringValue = (value) => String(value ?? "").trim();
const toNumber = (value) => {
  const normalized = String(value ?? "").replace(/\s/g, "").replace(",", ".");
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : 0;
};

const excelDateToIso = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    const parsed = xlsx.SSF.parse_date_code(value);
    if (!parsed) {
      return null;
    }
    const month = String(parsed.m).padStart(2, "0");
    const day = String(parsed.d).padStart(2, "0");
    return `${parsed.y}-${month}-${day}`;
  }

  const raw = toStringValue(value);
  if (!raw) {
    return null;
  }

  if (/^\d{4}$/.test(raw)) {
    return `${raw}-01-01`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
};

const findField = (row, aliases) => {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const key = entries.find(([candidate]) => normalize(candidate) === normalize(alias));
    if (key && toStringValue(key[1])) {
      return key[1];
    }
  }
  return "";
};

const safeIdentifier = (identifier) => {
  const parts = String(identifier).split(".");
  const allowed = /^[A-Za-z_][A-Za-z0-9_]*$/;
  if (parts.some((part) => !allowed.test(part))) {
    throw new Error(`Invalid table name: ${identifier}`);
  }
  return parts.map((part) => `"${part}"`).join(".");
};

const tableName = safeIdentifier(env.table);

const workbook = xlsx.readFile(filePath, { cellDates: false });
const targetSheet = sheetName || workbook.SheetNames[0];

if (!targetSheet || !workbook.Sheets[targetSheet]) {
  console.error(`Sheet not found: ${targetSheet}`);
  console.error(`Available sheets: ${workbook.SheetNames.join(", ")}`);
  process.exit(1);
}

const rowsAsArrays = xlsx.utils.sheet_to_json(workbook.Sheets[targetSheet], {
  header: 1,
  defval: "",
  raw: true
});

if (rowsAsArrays.length <= 1) {
  console.log("No rows found in Excel sheet");
  process.exit(0);
}

const headers = (rowsAsArrays[0] || []).map((item) => toStringValue(item));
const headerIndex = new Map(headers.map((header, index) => [normalize(header), index]));

const findColumnIndex = (aliases) => {
  for (const alias of aliases) {
    const index = headerIndex.get(normalize(alias));
    if (index !== undefined) {
      return index;
    }
  }
  return -1;
};

const column = {
  id: findColumnIndex(["ИРН", "irn", "id", "number", "project_id"]),
  title: findColumnIndex([
    "Название проекта",
    "title",
    "project_title",
    "topicrus",
    "Наименование программы (RU)",
    "Наименование программы (KZ)",
    "Наименование программы (EN)",
    "Наименование конкурса"
  ]),
  lead: findColumnIndex(["Заявитель", "lead", "applicant", "applicant_name"]),
  region: findColumnIndex(["Регион заявителя", "region", "applicant_region"]),
  status: findColumnIndex(["статус", "status", "state", "state_name"]),
  budget: findColumnIndex([
    "Сумма финансирования (одобр)",
    "Общая одобренная сумма",
    "budget",
    "accept_total",
    "approved_budget",
    "Сумма финансирования (запр)"
  ]),
  spent: findColumnIndex(["spent", "expense", "fact_total"]),
  priority: findColumnIndex(["Приоритет", "priority", "Приоритетное научное направление"]),
  financingType: findColumnIndex(["Тип финансирования", "financing_type", "competition_type", "GF/PCF/PK"]),
  startDate: findColumnIndex(["Дата начала", "start_date", "start", "year_b"]),
  endDate: findColumnIndex(["Дата окончания", "end_date", "end", "year_e"])
};

const valueAt = (row, index) => {
  if (index < 0) {
    return "";
  }
  return row[index] ?? "";
};

const rows = rowsAsArrays.slice(1).map((row, index) => {
  const idFromSource = toStringValue(valueAt(row, column.id));
  const title = toStringValue(valueAt(row, column.title));
  const lead = toStringValue(valueAt(row, column.lead));
  const region = toStringValue(valueAt(row, column.region));
  const status = toStringValue(valueAt(row, column.status)) || "active";
  const budget = toNumber(valueAt(row, column.budget));
  const spent = toNumber(valueAt(row, column.spent));
  const priority = toStringValue(valueAt(row, column.priority));
  const financingType = toStringValue(valueAt(row, column.financingType));

  const startDate = excelDateToIso(valueAt(row, column.startDate));
  const endDate = excelDateToIso(valueAt(row, column.endDate));

  const generatedId = crypto
    .createHash("sha1")
    .update(`${title}|${lead}|${region}|${index + 1}`)
    .digest("hex")
    .slice(0, 12);

  return {
    id: idFromSource || `project-${generatedId}`,
    title,
    lead,
    region,
    status,
    budget,
    spent,
    startDate,
    endDate,
    priority,
    financingType,
    tags: [priority, financingType].filter(Boolean).join(",")
  };
});

const validRows = rows.filter((row) => row.title && row.lead);
if (validRows.length === 0) {
  console.error("No valid rows to import (required: title and lead)");
  process.exit(1);
}

const client = new Client({
  host: env.host,
  port: env.port,
  database: env.database,
  user: env.user,
  password: env.password
});

await client.connect();

try {
  await client.query("BEGIN");

  await client.query(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
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
    )
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_projects_status ON ${tableName}(status)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_projects_region ON ${tableName}(region)`);

  if (truncate) {
    await client.query(`TRUNCATE TABLE ${tableName}`);
  }

  const upsertSql = `
    INSERT INTO ${tableName} (
      id, title, lead, region, status, budget, spent, start_date, end_date, priority, financing_type, tags, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET
      title = EXCLUDED.title,
      lead = EXCLUDED.lead,
      region = EXCLUDED.region,
      status = EXCLUDED.status,
      budget = EXCLUDED.budget,
      spent = EXCLUDED.spent,
      start_date = EXCLUDED.start_date,
      end_date = EXCLUDED.end_date,
      priority = EXCLUDED.priority,
      financing_type = EXCLUDED.financing_type,
      tags = EXCLUDED.tags,
      updated_at = NOW()
  `;

  for (const row of validRows) {
    await client.query(upsertSql, [
      row.id,
      row.title,
      row.lead,
      row.region,
      row.status,
      row.budget,
      row.spent,
      row.startDate,
      row.endDate,
      row.priority || null,
      row.financingType || null,
      row.tags || null
    ]);
  }

  await client.query("COMMIT");
  console.log(`Imported ${validRows.length} rows into ${env.database}.${env.table}`);
} catch (error) {
  await client.query("ROLLBACK");
  console.error("Import failed:", error.message || error);
  process.exitCode = 1;
} finally {
  await client.end();
}
