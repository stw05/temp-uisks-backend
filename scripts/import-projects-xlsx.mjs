#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import pg from "pg";
import xlsx from "xlsx";

const { Client } = pg;

const usage = () => {
  console.log(
    "Usage: node scripts/import-projects-xlsx.mjs <fileOrDir> [more files...] [--sheet <sheetName>] [--all-sheets] [--truncate]"
  );
};

const args = process.argv.slice(2);
if (args.length === 0) {
  usage();
  process.exit(1);
}

const inputPaths = [];
let sheetName;
let allSheets = false;
let truncate = false;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (!arg.startsWith("--")) {
    inputPaths.push(arg);
    continue;
  }
  if (arg === "--sheet") {
    sheetName = args[index + 1];
    index += 1;
    continue;
  }
  if (arg === "--all-sheets") {
    allSheets = true;
    continue;
  }
  if (arg === "--truncate") {
    truncate = true;
    continue;
  }

  console.error(`Unknown option: ${arg}`);
  usage();
  process.exit(1);
}

if (inputPaths.length === 0) {
  console.error("At least one file or directory is required");
  usage();
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
const toStringValue = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const slug = (value) =>
  normalize(value)
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();

const isExcelFile = (fileName) => /\.(xlsx|xlsm|xls)$/i.test(fileName);

const resolveInputFiles = (rawPaths) => {
  const files = [];

  for (const rawPath of rawPaths) {
    const resolved = path.resolve(process.cwd(), rawPath);
    if (!fs.existsSync(resolved)) {
      console.error(`Path not found: ${resolved}`);
      process.exit(1);
    }

    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      const nested = fs
        .readdirSync(resolved)
        .filter((name) => isExcelFile(name))
        .sort((a, b) => a.localeCompare(b))
        .map((name) => path.join(resolved, name));
      files.push(...nested);
      continue;
    }

    if (!isExcelFile(resolved)) {
      console.error(`Unsupported file type (expected .xlsx/.xls/.xlsm): ${resolved}`);
      process.exit(1);
    }

    files.push(resolved);
  }

  const unique = Array.from(new Set(files));
  if (unique.length === 0) {
    console.error("No Excel files found in input paths");
    process.exit(1);
  }

  return unique;
};

const sourceFiles = resolveInputFiles(inputPaths);
const toNumber = (value) => {
  const normalized = String(value ?? "")
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "")
    .replace(/,(?=\d{1,2}$)/, ".")
    .replace(/,/g, "");
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

  const dotSeparated = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dotSeparated) {
    const day = dotSeparated[1].padStart(2, "0");
    const month = dotSeparated[2].padStart(2, "0");
    const year = dotSeparated[3];
    return `${year}-${month}-${day}`;
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

const detectStatus = (value, endDate) => {
  const text = normalize(value);
  if (!text) {
    if (endDate && endDate < new Date().toISOString().slice(0, 10)) {
      return "completed";
    }
    return "active";
  }

  if (text.includes("заверш") || text.includes("completed") || text.includes("done") || text.includes("исполн")) {
    return "completed";
  }
  if (text.includes("отклон") || text.includes("cancel") || text.includes("приостан")) {
    return "suspended";
  }
  return "active";
};

const pickString = (left, right) => {
  const leftValue = toStringValue(left);
  const rightValue = toStringValue(right);
  if (!leftValue) {
    return rightValue;
  }
  if (!rightValue) {
    return leftValue;
  }
  return rightValue.length > leftValue.length ? rightValue : leftValue;
};

const pickDate = (left, right, mode) => {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  if (mode === "min") {
    return left <= right ? left : right;
  }
  return left >= right ? left : right;
};

const mergeRows = (left, right) => {
  const tags = Array.from(new Set([...(left.tags || []), ...(right.tags || [])].map(toStringValue).filter(Boolean)));
  const mergedExcelData = { ...(left.excelData || {}) };

  for (const [key, value] of Object.entries(right.excelData || {})) {
    const current = toStringValue(mergedExcelData[key]);
    const next = toStringValue(value);

    if (!current && next) {
      mergedExcelData[key] = value;
      continue;
    }

    if (current && next && next.length > current.length) {
      mergedExcelData[key] = value;
    }
  }

  return {
    id: left.id || right.id,
    title: pickString(left.title, right.title),
    lead: pickString(left.lead, right.lead),
    region: pickString(left.region, right.region),
    status: pickString(left.status, right.status) || "active",
    budget: Math.max(Number(left.budget || 0), Number(right.budget || 0)),
    spent: Math.max(Number(left.spent || 0), Number(right.spent || 0)),
    startDate: pickDate(left.startDate, right.startDate, "min"),
    endDate: pickDate(left.endDate, right.endDate, "max"),
    priority: pickString(left.priority, right.priority),
    financingType: pickString(left.financingType, right.financingType),
    tags,
    excelData: mergedExcelData,
    sourceRef: `${left.sourceRef}; ${right.sourceRef}`
  };
};

const ALIASES = {
  id: ["ИРН", "irn", "id", "number", "project_id"],
  title: [
    "Название проекта",
    "title",
    "project_title",
    "topicrus",
    "Наименование программы (RU)",
    "Наименование программы (KZ)",
    "Наименование программы (EN)",
    "Наименование конкурса"
  ],
  lead: ["Заявитель", "lead", "applicant", "applicant_name", "Руководитель проекта", "Руководитель"],
  region: ["Регион заявителя", "region", "applicant_region", "Регион", "Область"],
  status: ["статус", "status", "state", "state_name", "Состояние"],
  budget: [
    "Сумма финансирования (одобр)",
    "Общая одобренная сумма",
    "budget",
    "accept_total",
    "approved_budget",
    "Сумма финансирования (запр)",
    "Сумма"
  ],
  spent: ["spent", "expense", "fact_total", "Освоено", "Кассовое исполнение"],
  priority: ["Приоритет", "priority", "Приоритетное научное направление"],
  financingType: ["Тип финансирования", "financing_type", "competition_type", "GF/PCF/PK", "Тип конкурса"],
  startDate: ["Дата начала", "start_date", "start", "year_b", "Начало"],
  endDate: ["Дата окончания", "end_date", "end", "year_e", "Окончание"]
};

const aliasPool = Object.values(ALIASES)
  .flat()
  .map((alias) => slug(alias));

const detectHeaderRowIndex = (rowsAsArrays) => {
  const maxRows = Math.min(rowsAsArrays.length, 20);
  let bestIndex = 0;
  let bestScore = -1;

  for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
    const row = rowsAsArrays[rowIndex] || [];
    const score = row
      .map((cell) => slug(cell))
      .filter(Boolean)
      .reduce((acc, cellSlug) => {
        if (aliasPool.some((alias) => alias === cellSlug || cellSlug.includes(alias) || alias.includes(cellSlug))) {
          return acc + 1;
        }
        return acc;
      }, 0);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = rowIndex;
    }
  }

  return bestIndex;
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
const findColumnIndex = (headerIndex, aliases) => {
  const normalizedHeaderEntries = Array.from(headerIndex.entries());

  for (const alias of aliases) {
    const normalizedAlias = normalize(alias);
    const strictMatch = headerIndex.get(normalizedAlias);
    if (strictMatch !== undefined) {
      return strictMatch;
    }

    const fuzzy = normalizedHeaderEntries.find(([key]) => key.includes(normalizedAlias) || normalizedAlias.includes(key));
    if (fuzzy) {
      return fuzzy[1];
    }
  }

  return -1;
};

const valueAt = (row, index) => (index < 0 ? "" : row[index] ?? "");

const toJsonSafeCellValue = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return toStringValue(value);
};

const buildExcelData = (headers, row) => {
  const excelData = {};

  for (let index = 0; index < headers.length; index += 1) {
    const header = toStringValue(headers[index]) || `column_${index + 1}`;
    const cellValue = toJsonSafeCellValue(valueAt(row, index));
    if (cellValue === null) {
      continue;
    }

    const key = excelData[header] === undefined ? header : `${header}__${index + 1}`;
    excelData[key] = cellValue;
  }

  return excelData;
};

const parseWorkbookRows = (workbook, sourceFile) => {
  const targetSheets = allSheets ? workbook.SheetNames : [sheetName || workbook.SheetNames[0]];
  const parsedRows = [];

  for (const currentSheetName of targetSheets) {
    if (!currentSheetName || !workbook.Sheets[currentSheetName]) {
      console.error(`Sheet not found: ${currentSheetName}`);
      console.error(`Available sheets in ${path.basename(sourceFile)}: ${workbook.SheetNames.join(", ")}`);
      process.exit(1);
    }

    const rowsAsArrays = xlsx.utils.sheet_to_json(workbook.Sheets[currentSheetName], {
      header: 1,
      defval: "",
      raw: true
    });

    if (rowsAsArrays.length <= 1) {
      continue;
    }

    const headerRowIndex = detectHeaderRowIndex(rowsAsArrays);
    const headers = (rowsAsArrays[headerRowIndex] || []).map((item) => toStringValue(item));
    const headerIndex = new Map(headers.map((header, index) => [normalize(header), index]));

    const column = {
      id: findColumnIndex(headerIndex, ALIASES.id),
      title: findColumnIndex(headerIndex, ALIASES.title),
      lead: findColumnIndex(headerIndex, ALIASES.lead),
      region: findColumnIndex(headerIndex, ALIASES.region),
      status: findColumnIndex(headerIndex, ALIASES.status),
      budget: findColumnIndex(headerIndex, ALIASES.budget),
      spent: findColumnIndex(headerIndex, ALIASES.spent),
      priority: findColumnIndex(headerIndex, ALIASES.priority),
      financingType: findColumnIndex(headerIndex, ALIASES.financingType),
      startDate: findColumnIndex(headerIndex, ALIASES.startDate),
      endDate: findColumnIndex(headerIndex, ALIASES.endDate)
    };

    const sheetRows = rowsAsArrays.slice(headerRowIndex + 1).map((row, index) => {
      const idFromSource = toStringValue(valueAt(row, column.id));
      const title = toStringValue(valueAt(row, column.title));
      const lead = toStringValue(valueAt(row, column.lead)) || "Не указано";
      const region = toStringValue(valueAt(row, column.region)) || "Не указан";
      const priority = toStringValue(valueAt(row, column.priority));
      const financingType = toStringValue(valueAt(row, column.financingType));
      const startDate = excelDateToIso(valueAt(row, column.startDate));
      const endDate = excelDateToIso(valueAt(row, column.endDate));
      const status = detectStatus(toStringValue(valueAt(row, column.status)), endDate);

      const generatedId = crypto
        .createHash("sha1")
        .update(`${slug(title)}|${slug(lead)}|${slug(region)}|${startDate || ""}|${endDate || ""}`)
        .digest("hex")
        .slice(0, 12);

      return {
        id: idFromSource || `project-${generatedId}`,
        title,
        lead,
        region,
        status,
        budget: toNumber(valueAt(row, column.budget)),
        spent: toNumber(valueAt(row, column.spent)),
        startDate,
        endDate,
        priority,
        financingType,
        tags: [priority, financingType].filter(Boolean),
        excelData: buildExcelData(headers, row),
        sourceRef: `${path.basename(sourceFile)}:${currentSheetName}:${headerRowIndex + index + 2}`
      };
    });

    parsedRows.push(...sheetRows.filter((row) => row.title));
  }

  return parsedRows;
};

const allRows = [];
for (const sourceFile of sourceFiles) {
  const workbook = xlsx.readFile(sourceFile, { cellDates: false });
  const rows = parseWorkbookRows(workbook, sourceFile);
  allRows.push(...rows);
}

if (allRows.length === 0) {
  console.log("No valid rows found in provided Excel files");
  process.exit(0);
}

const deduplicated = new Map();
let mergedCount = 0;
for (const row of allRows) {
  const existing = deduplicated.get(row.id);
  if (!existing) {
    deduplicated.set(row.id, row);
    continue;
  }

  deduplicated.set(row.id, mergeRows(existing, row));
  mergedCount += 1;
}

const validRows = Array.from(deduplicated.values());

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
  await client.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS excel_data JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await client.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS source_ref TEXT NULL`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_projects_excel_data_gin ON ${tableName} USING GIN (excel_data)`);

  if (truncate) {
    await client.query(`TRUNCATE TABLE ${tableName}`);
  }

  const upsertSql = `
    INSERT INTO ${tableName} (
      id, title, lead, region, status, budget, spent, start_date, end_date, priority, financing_type, tags, excel_data, source_ref, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, NOW()
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
        excel_data = EXCLUDED.excel_data,
        source_ref = EXCLUDED.source_ref,
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
      row.tags || null,
      JSON.stringify(row.excelData || {}),
      row.sourceRef
    ]);
  }

  await client.query("COMMIT");
  console.log(
    `Imported ${validRows.length} unique rows (merged ${mergedCount} duplicates) from ${sourceFiles.length} file(s) into ${env.database}.${env.table}`
  );
} catch (error) {
  await client.query("ROLLBACK");
  console.error("Import failed:", error.message || error);
  process.exitCode = 1;
} finally {
  await client.end();
}
