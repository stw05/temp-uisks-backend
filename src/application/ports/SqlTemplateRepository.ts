export interface SqlTemplateLocation {
  domain: string;
  locale: string;
  fileName: string;
}

export interface SqlTemplateRepository {
  readTemplate(location: SqlTemplateLocation): Promise<string>;
}
