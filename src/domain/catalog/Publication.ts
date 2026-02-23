export interface Publication {
  id: string;
  title: string;
  authors: string[];
  year: number;
  type: string;
  doi: string;
  projectId: string;
  link: string;
  abstract?: string;
  pdfUrl?: string;
}
