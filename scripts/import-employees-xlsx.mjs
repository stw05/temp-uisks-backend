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
    "Usage: node scripts/import-employees-xlsx.mjs <fileOrDir> [more files...] [--sheet <sheetName>] [--truncate]"
  );
};

const args = process.argv.slice(2);
if (args.length === 0) {
  usage();
  process.exit(1);
}

const inputPaths = [];
let sheetName;
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
  table: process.env.USERS_EMPLOYEES_TABLE ?? "employees"
};

const normalize = (value) => String(value ?? "").toLowerCase().trim();
const toStringValue = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

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

const findField = (row, aliases) => {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const key = entries.find(([candidate]) => normalize(candidate) === normalize(alias));
    if (key) {
      return key[1];
    }
  }
  return "";
};

const parseCodes = (value) =>
  toStringValue(value)
    .split(/[,;\r\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const safeIdentifier = (identifier) => {
  const parts = String(identifier).split(".");
  const allowed = /^[A-Za-z_][A-Za-z0-9_]*$/;
  if (parts.some((part) => !allowed.test(part))) {
    throw new Error(`Invalid table name: ${identifier}`);
  }
  return parts.map((part) => `"${part}"`).join(".");
};

const tableName = safeIdentifier(env.table);

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
  headers.forEach((header, index) => {
    const key = toStringValue(header) || `column_${index + 1}`;
    const cellValue = toJsonSafeCellValue(row[header]);
    if (cellValue !== null) {
      excelData[key] = cellValue;
    }
  });
  return excelData;
};

const parseWorkbookRows = (workbook, sourceFile) => {
  const targetSheetName = sheetName || (workbook.SheetNames.includes("expdata") ? "expdata" : workbook.SheetNames[0]);

  if (!workbook.Sheets[targetSheetName]) {
    console.error(`Sheet not found: ${targetSheetName}`);
    console.error(`Available sheets in ${path.basename(sourceFile)}: ${workbook.SheetNames.join(", ")}`);
    process.exit(1);
  }

  const rows = xlsx.utils.sheet_to_json(workbook.Sheets[targetSheetName], { defval: "", raw: true });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

  return rows
    .map((row, index) => {
      const name = toStringValue(findField(row, ["ф.и.о.", "фио", "ФИО"]));
      if (!name) {
        return null;
      }

      const citizenship = toStringValue(findField(row, ["Гражданство"]));
      const academicDegree = toStringValue(findField(row, ["Ученая степень"]));
      const position = toStringValue(findField(row, ["Ученое звание"]));
      const scopusAuthorId = toStringValue(findField(row, ["Author ID SCOPUS"]));
      const researcherIdWos = toStringValue(findField(row, ["Researcher ID web of science"]));
      const orcid = toStringValue(findField(row, ["ORCID ID"]));
      const hIndex = toNumber(findField(row, ["H-index"]));
      const region = toStringValue(findField(row, ["Регион"])) || "Не указан";
      const gender = toStringValue(findField(row, ["Gender"])) || toStringValue(findField(row, ["Пол"]));
      const department = toStringValue(findField(row, ["Место работы"]));
      const classifier = toStringValue(findField(row, ["Классификатор научных направлений"]));
      const mrnti = toStringValue(findField(row, ["МРНТИ"]));
      const leadCodes = parseCodes(findField(row, ["Отчет н.р."]));
      const memberCodes = parseCodes(findField(row, ["Отчет ч.и.г."]));
      const projectIds = Array.from(new Set([...leadCodes, ...memberCodes]));
      const projectRole = leadCodes.length > 0 ? "руководитель" : memberCodes.length > 0 ? "исполнитель" : "";

      const idSource = scopusAuthorId || `${name}|${department}|${region}`;
      const generatedId = crypto.createHash("sha1").update(idSource).digest("hex").slice(0, 16);

      return {
        id: `employee-${generatedId}`,
        name,
        position,
        department,
        region,
        hIndex,
        academicDegree,
        scopusAuthorId,
        researcherIdWos,
        orcid,
        gender,
        citizenship,
        projectRole,
        mrnti,
        classifier,
        projectIds,
        excelData: buildExcelData(headers, row),
        sourceRef: `${path.basename(sourceFile)}:${targetSheetName}:${index + 2}`
      };
    })
    .filter(Boolean);
};

const allRows = [];
for (const sourceFile of sourceFiles) {
  const workbook = xlsx.readFile(sourceFile, { cellDates: false });
  allRows.push(...parseWorkbookRows(workbook, sourceFile));
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
  mergedCount += 1;
  deduplicated.set(row.id, {
    ...existing,
    projectIds: Array.from(new Set([...existing.projectIds, ...row.projectIds])),
    excelData: { ...existing.excelData, ...row.excelData }
  });
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
    )
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_employees_region ON ${tableName}(region)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_employees_department ON ${tableName}(department)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_employees_excel_data_gin ON ${tableName} USING GIN (excel_data)`);

  if (truncate) {
    await client.query(`TRUNCATE TABLE ${tableName}`);
  }

  const upsertSql = `
    INSERT INTO ${tableName} (
      id, name, position, department, region, h_index, academic_degree, scopus_author_id,
      researcher_id_wos, orcid, gender, citizenship, project_role, mrnti, classifier,
      project_ids, excel_data, source_ref, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18, NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET
      name = EXCLUDED.name,
      position = EXCLUDED.position,
      department = EXCLUDED.department,
      region = EXCLUDED.region,
      h_index = EXCLUDED.h_index,
      academic_degree = EXCLUDED.academic_degree,
      scopus_author_id = EXCLUDED.scopus_author_id,
      researcher_id_wos = EXCLUDED.researcher_id_wos,
      orcid = EXCLUDED.orcid,
      gender = EXCLUDED.gender,
      citizenship = EXCLUDED.citizenship,
      project_role = EXCLUDED.project_role,
      mrnti = EXCLUDED.mrnti,
      classifier = EXCLUDED.classifier,
      project_ids = EXCLUDED.project_ids,
      excel_data = EXCLUDED.excel_data,
      source_ref = EXCLUDED.source_ref,
      updated_at = NOW()
  `;

  for (const row of validRows) {
    await client.query(upsertSql, [
      row.id,
      row.name,
      row.position || null,
      row.department || null,
      row.region,
      row.hIndex,
      row.academicDegree || null,
      row.scopusAuthorId || null,
      row.researcherIdWos || null,
      row.orcid || null,
      row.gender || null,
      row.citizenship || null,
      row.projectRole || null,
      row.mrnti || null,
      row.classifier || null,
      row.projectIds.join(",") || null,
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
