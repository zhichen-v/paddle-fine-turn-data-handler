export type AnnotationType = "dimension" | "fcf" | "datum" | "note";

export type Point = [number, number];

export type Annotation = {
  id: string;
  type: AnnotationType;
  transcription: string;
  points: [Point, Point, Point, Point];
  ignore?: boolean;
};

export type ProjectPage = {
  id: string;
  sourceName: string;
  imagePath: string;
  width: number;
  height: number;
  dpi: number | null;
  annotations: Annotation[];
};

export type Project = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  pages: ProjectPage[];
};

export type ProjectSummary = {
  id: string;
  name: string;
  updatedAt: string;
  pageCount: number;
};

export type ExportResult = {
  exportDir: string;
  trainFile: string;
  valFile: string;
  trainPages: number;
  valPages: number;
};
