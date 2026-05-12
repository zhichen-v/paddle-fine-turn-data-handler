import type { ExportResult, Project, ProjectSummary } from "./types";

const jsonHeaders = { "Content-Type": "application/json" };

export async function listProjects(): Promise<ProjectSummary[]> {
  const response = await fetch("/api/projects");
  return readJson(response).then((data) => data.projects);
}

export async function createProject(name: string): Promise<{ project: Project; exportResult?: ExportResult }> {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ name })
  });
  return readJson(response);
}

export async function getProject(id: string): Promise<Project> {
  const response = await fetch(`/api/projects/${id}`);
  return readJson(response).then((data) => data.project);
}

export async function saveProject(project: Project, valRatio: number): Promise<{ project: Project; exportResult: ExportResult }> {
  const response = await fetch(`/api/projects/${project.id}`, {
    method: "PUT",
    headers: jsonHeaders,
    body: JSON.stringify({ project, valRatio })
  });
  return readJson(response);
}

export async function importNewDataset(file: File, dpi: number): Promise<{ project: Project; exportResult: ExportResult }> {
  const form = new FormData();
  form.append("file", file);
  form.append("dpi", String(dpi));
  const response = await fetch("/api/import", {
    method: "POST",
    body: form
  });
  return readJson(response);
}

export async function importFile(projectId: string, file: File, dpi: number): Promise<{ project: Project; exportResult: ExportResult }> {
  const form = new FormData();
  form.append("file", file);
  form.append("dpi", String(dpi));
  const response = await fetch(`/api/projects/${projectId}/import`, {
    method: "POST",
    body: form
  });
  return readJson(response);
}

export async function exportProject(projectId: string, valRatio: number): Promise<ExportResult> {
  const response = await fetch(`/api/projects/${projectId}/export`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ valRatio })
  });
  return readJson(response);
}

export function fileUrl(imagePath: string): string {
  return `/files/${imagePath}`;
}

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  return data;
}
