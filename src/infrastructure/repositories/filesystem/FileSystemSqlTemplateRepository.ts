import fs from "node:fs/promises";
import path from "node:path";
import { SqlTemplateLocation, SqlTemplateRepository } from "../../../application/ports/SqlTemplateRepository";
import { AppError } from "../../../shared/http/errors";

const sanitizeSegment = (value: string): string => {
  if (value.includes("..") || value.includes("/") || value.includes("\\")) {
    throw new AppError("Invalid path segment", 400);
  }

  return value;
};

export class FileSystemSqlTemplateRepository implements SqlTemplateRepository {
  private readonly templateCache = new Map<string, string>();

  constructor(private readonly baseDir: string) {}

  async readTemplate(location: SqlTemplateLocation): Promise<string> {
    const domain = sanitizeSegment(location.domain);
    const locale = sanitizeSegment(location.locale);
    const fileName = sanitizeSegment(location.fileName);
    const filePath = path.resolve(this.baseDir, domain, locale, fileName);

    if (!filePath.startsWith(this.baseDir)) {
      throw new AppError("Invalid SQL template path", 400);
    }

    const cached = this.templateCache.get(filePath);
    if (cached !== undefined) {
      return cached;
    }

    try {
      const sql = await fs.readFile(filePath, "utf8");
      this.templateCache.set(filePath, sql);
      return sql;
    } catch {
      throw new AppError("SQL template not found", 404);
    }
  }
}
