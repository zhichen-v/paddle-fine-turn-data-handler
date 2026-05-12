import type { Annotation, AnnotationType, Point } from "./types";

export function annotationToRect(annotation: Annotation) {
  const xs = annotation.points.map((point) => point[0]);
  const ys = annotation.points.map((point) => point[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y
  };
}

export function rectToPoints(x: number, y: number, width: number, height: number): [Point, Point, Point, Point] {
  const left = Math.round(Math.min(x, x + width));
  const top = Math.round(Math.min(y, y + height));
  const right = Math.round(Math.max(x, x + width));
  const bottom = Math.round(Math.max(y, y + height));
  return [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom]
  ];
}

export function clampRectToImage(rect: { x: number; y: number; width: number; height: number }, width: number, height: number) {
  const x = Math.max(0, Math.min(width, rect.x));
  const y = Math.max(0, Math.min(height, rect.y));
  return {
    x,
    y,
    width: Math.max(1, Math.min(width - x, rect.width)),
    height: Math.max(1, Math.min(height - y, rect.height))
  };
}

export function sortClockwise(points: Point[]): [Point, Point, Point, Point] {
  const four = points.slice(0, 4).map(([x, y]) => [Number(x), Number(y)] as Point);
  const center = four.reduce(
    (acc, point) => [acc[0] + point[0] / four.length, acc[1] + point[1] / four.length] as Point,
    [0, 0] as Point
  );
  const sorted = four
    .slice()
    .sort((a, b) => Math.atan2(a[1] - center[1], a[0] - center[0]) - Math.atan2(b[1] - center[1], b[0] - center[0]));
  const topLeftIndex = sorted.reduce((best, point, index) => {
    const bestPoint = sorted[best];
    return point[0] + point[1] < bestPoint[0] + bestPoint[1] ? index : best;
  }, 0);
  const ordered = [...sorted.slice(topLeftIndex), ...sorted.slice(0, topLeftIndex)];
  return ordered.map(([x, y]) => [Math.round(x), Math.round(y)] as Point) as [Point, Point, Point, Point];
}

export function labelMeShapesToAnnotations(raw: unknown): Annotation[] {
  const data = raw as { shapes?: Array<{ label?: string; text?: string; points?: Point[]; shape_type?: string }> };
  if (!Array.isArray(data.shapes)) return [];

  return data.shapes
    .map((shape) => {
      if (!Array.isArray(shape.points) || shape.points.length < 2) return null;
      const transcription = String(shape.label || shape.text || "").trim();
      const points =
        shape.shape_type === "rectangle" || shape.points.length === 2
          ? rectanglePointsFromTwo(shape.points[0], shape.points[1])
          : sortClockwise(shape.points);
      return {
        id: crypto.randomUUID(),
        type: inferType(transcription),
        transcription,
        points,
        ignore: transcription === "###"
      } satisfies Annotation;
    })
    .filter(Boolean) as Annotation[];
}

export function validateAnnotations(annotations: Annotation[]) {
  const empty = annotations.filter((annotation) => !annotation.ignore && !annotation.transcription.trim()).length;
  const invalid = annotations.filter((annotation) => {
    const rect = annotationToRect(annotation);
    return rect.width < 2 || rect.height < 2;
  }).length;
  return { empty, invalid };
}

function rectanglePointsFromTwo(a: Point, b: Point): [Point, Point, Point, Point] {
  return rectToPoints(a[0], a[1], b[0] - a[0], b[1] - a[1]);
}

function inferType(text: string): AnnotationType {
  if (/^[A-Z]$/.test(text)) return "datum";
  if (/[|⊥∥⌖⌭]/.test(text)) return "fcf";
  return "dimension";
}
