export interface Employee {
  id: string;
  name: string;
  position: string;
  department: string;
  region: string;
  email: string;
  phone: string;
  avatarUrl: string;
  projectsIds: string[];
  metrics: Record<string, number | string>;
  bio?: string;
  publicationsIds?: string[];
}
