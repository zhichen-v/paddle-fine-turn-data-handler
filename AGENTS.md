# AGENTS.md

This file is for future coding agents working on this repository.

## Project Purpose

Build and maintain a local annotation app for creating PaddleOCR text-detection fine-tune datasets from engineering drawings. The app is intentionally not an OCR engine. It is a data preparation tool for manual box annotation and transcription.

Primary output:

```txt
images/page_001.png	[{"transcription":"200±0.05","points":[[100,50],[180,50],[180,80],[100,80]]}]
```

Ignore regions must export as:

```json
{"transcription":"###","points":[[...],[...],[...],[...]]}
```

## Tech Stack

- Frontend: Vite + React + TypeScript
- Canvas: Konva / React-Konva
- Backend: Node.js + Express
- PDF worker: Python executed by `uv`
- Python PDF dependency: `PyMuPDF`

Do not add OCR inference unless explicitly requested.

## Important Commands

Install:

```powershell
npm install
uv run --project . python scripts/pdf_to_images.py --help
```

Run app:

```powershell
npm run dev
```

Build:

```powershell
npm run build
```

Backend health check:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:4177/api/health'
```

## Runtime Ports

- Frontend: `http://127.0.0.1:5173`
- Backend: `http://127.0.0.1:4177`

Vite proxies `/api` and `/files` to the backend.

## Repository Layout

```txt
src/
  App.tsx              Main UI, toolbar, inspector, canvas flow
  api.ts               Frontend API client
  geometry.ts          Point conversion, LabelMe import, annotation validation
  types.ts             Shared frontend types
  useImageElement.ts   Browser image loader hook
  styles.css           UI styling
server/
  index.mjs            Express API, project persistence, imports, exports
scripts/
  pdf_to_images.py     PDF rasterization worker
data/
  projects/            Local project JSON and page images, gitignored
  exports/             PaddleOCR dataset exports, gitignored
  uploads/             Temporary uploads, gitignored
```

## Data Model

Project files live at:

```txt
data/projects/<project_id>/project.json
```

Core shape:

```ts
type Project = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  pages: ProjectPage[];
};
```

Each annotation stores four image-coordinate points:

```ts
type Annotation = {
  id: string;
  type: "dimension" | "fcf" | "datum" | "note";
  transcription: string;
  points: [[number, number], [number, number], [number, number], [number, number]];
  ignore?: boolean;
};
```

Only `transcription` and `points` are exported to PaddleOCR labels.

## API Surface

Implemented endpoints:

- `GET /api/health`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`
- `PUT /api/projects/:id`
- `POST /api/projects/:id/import`
- `POST /api/projects/:id/export`

Static files are served from:

```txt
/files/<path_under_data>
```

## PDF Import

PDF import uses:

```powershell
uv run --project . python scripts/pdf_to_images.py --input <pdf> --output <dir> --prefix <prefix> --dpi <dpi>
```

The worker prints a JSON manifest to stdout:

```json
{"pages":[{"pageNumber":1,"fileName":"page_001.png","width":1500,"height":1060}]}
```

Keep this stdout contract stable unless updating `server/index.mjs` at the same time.

## LabelMe Import

`src/geometry.ts` imports LabelMe-like JSON:

- `rectangle`: two points become a four-point rectangle.
- `polygon`: first four points are normalized.
- `label` is used before `text`.

Avoid broad format changes here unless you add tests or a clear compatibility path.

## Export Rules

Exports live under:

```txt
data/exports/<project_id>_<timestamp>/
```

Files:

```txt
images/
train.txt
val.txt
manifest.json
```

Rules:

- Copy page images into `images/`.
- Write one label line per page.
- Use tab between image path and JSON.
- If a project has only one page, keep it in train and leave val empty.
- Round point coordinates to integers.

## Coding Guidelines

- Keep the app local-first. Do not introduce cloud services.
- Preserve existing project JSON compatibility where possible.
- Use `uv` for Python dependencies. Do not ask users to install Python packages globally.
- Do not commit generated user data under `data/projects`, `data/exports`, or `data/uploads`.
- Keep annotation coordinates in original image space, not canvas/screen space.
- If changing canvas zoom/pan behavior, verify manual box creation and dragging still write image-space coordinates.
- If changing export behavior, inspect the generated `train.txt` manually.

## Verification Checklist

Before finishing a code change, run:

```powershell
npm run build
```

For PDF-related changes, also run:

```powershell
uv run --project . python scripts/pdf_to_images.py --help
```

For UI changes, start the app and verify:

- App loads at `http://127.0.0.1:5173`
- Existing project loads
- Import button is visible
- Drawing a box creates one annotation
- Editing transcription updates the selected box
- Save disables after successful save
- Export produces `train.txt`
