export interface Project {
  id: string;
  title: string;
  lead: string;
  region: string;
  status: string;
  budget: number;
  spent: number;
  startDate: string | null;
  endDate: string | null;
  tags: string[];
  description?: string;
  teamIds?: string[];
  publicationsIds?: string[];
  files?: string[];
}
