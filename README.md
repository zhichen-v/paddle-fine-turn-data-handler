# GD&T PaddleOCR Data Handler

[中文說明](README_zh.md)

Local annotation tool for building PaddleOCR text-detection fine-tune datasets from engineering drawings. The tool does not run OCR. It is designed to speed up manual box annotation, transcription entry, export-backed persistence, and PaddleOCR detection-label export.

## Use Case

This project targets GD&T and dimension extraction training data:

- Dimensions such as `200±0.05`, `R5`, `8X ⌀10`
- Datum labels such as `A`, `B`, `C`
- Feature control frames or GD&T symbol groups
- Engineering drawing notes when they are useful for the detection model

The exported label format follows PaddleOCR text detection training format:

```txt
images/page_001.png	[{"transcription":"200±0.05","points":[[100,50],[180,50],[180,80],[100,80]]}]
```

`points` are four image-coordinate points. Ignore boxes are exported with `"transcription":"###"`.

## Stack

- Frontend: Vite, React, TypeScript, Konva / React-Konva
- Backend: Node.js, Express
- PDF rasterization: Python worker executed through `uv`, using `PyMuPDF`
- Editing cache: local JSON files under `data/projects`
- Dataset source of truth: local folders under `data/exports`

## Requirements

- Node.js 22 or newer is recommended
- npm
- uv

Python dependencies are managed by `uv`; do not install Python dependencies globally.

## Install

```powershell
npm install
uv run --project . python scripts/pdf_to_images.py --help
```

The second command creates `.venv` if needed and verifies the PDF worker.

## Run

```powershell
npm run dev
```

Open:

```txt
http://127.0.0.1:5173
```

The dev command starts:

- API server: `http://127.0.0.1:4177`
- Vite frontend: `http://127.0.0.1:5173`

## Build

```powershell
npm run build
```

The build runs TypeScript checking and Vite production bundling.

## Basic Workflow

1. Import a PDF, PNG, JPG, or JPEG. Each import creates a new dataset.
2. Or select an existing dataset from the left panel. Datasets are loaded from `data/exports/*/project.json`.
3. For PDFs, choose a DPI before import. The backend converts each page to PNG.
4. Draw boxes around dimension / GD&T / datum regions.
5. Enter the transcription manually.
6. Use `###` ignore boxes for regions that should be skipped by PaddleOCR training.
7. Click Save. Save overwrites the same dataset folder under `data/exports/<dataset_id>/`.
8. Click Export only when you want to manually rebuild the same export folder.

## UI Controls

- Select tool: select, move, and resize existing boxes.
- Draw tool: drag on the drawing to create a new box.
- Pan tool: move around the canvas.
- Mouse wheel: zoom around the pointer position.
- Symbol buttons: append common GD&T / dimension symbols to the selected transcription.
- Import new: import a new PDF/image as a new dataset.
- Import LabelMe JSON: import old annotation output into the active page.

## LabelMe JSON Import

The app can import LabelMe-like JSON files with a `shapes` array. Supported shapes:

- `rectangle`: two points are converted to four PaddleOCR points.
- `polygon`: first four points are normalized into clockwise order.

The app uses `label` first, then `text`, as the transcription value.

## Local Data Layout

```txt
data/
├── projects/
│   └── <project_id>/
│       ├── project.json
│       └── pages/
├── exports/
│   └── <dataset_id>/
│       ├── images/
│       ├── train.txt
│       ├── val.txt
│       ├── project.json
│       └── manifest.json
└── uploads/
```

`data/projects`, `data/exports`, and `data/uploads` are ignored by git. `data/projects` is an internal editing cache. `data/exports/<dataset_id>/project.json` is what the UI uses to reload processed datasets.

## Export Output

Exports are written under a stable dataset folder:

```txt
data/exports/<dataset_id>/
```

Save and Export both overwrite the same folder for the current dataset. A new folder is created only when you import a new image/PDF as a new dataset.

Each dataset export contains:

```txt
images/
train.txt
val.txt
project.json
manifest.json
```

The validation split is controlled in the UI by `Val ratio`. If the project has only one page, the export keeps it in `train.txt` and leaves `val.txt` empty.

## Annotation Policy Recommendation

Use one consistent policy before producing large training data:

- One dimension group is one box.
- One datum marker is one box.
- Initially, keep one full feature control frame as one box.
- Do not box pure geometry lines, arrows, centerlines, or hatch lines unless they are part of an OCR target.
- Keep boxes tight around the intended readable region.
- Use `###` for regions that should be ignored during detection training.

Consistency matters more than over-optimizing the first version of the box policy.

## Important Files

- `src/App.tsx`: main annotation UI and canvas workflow
- `src/geometry.ts`: point conversion, LabelMe import, validation helpers
- `src/api.ts`: frontend API client
- `server/index.mjs`: project storage, import API, export API
- `scripts/pdf_to_images.py`: PDF-to-PNG worker
- `pyproject.toml`: Python worker dependencies

## Troubleshooting

If PDF import fails, verify `uv` and the worker:

```powershell
uv run --project . python scripts/pdf_to_images.py --help
```

If the app loads but API actions fail, verify the backend:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:4177/api/health'
```

If the frontend port is occupied, update `vite.config.ts` or stop the process using port `5173`.

## Current Scope

Implemented:

- Manual box annotation
- Project save/load
- Image import
- PDF-to-PNG import
- LabelMe-like JSON import
- Stable overwrite PaddleOCR detection export
- Reloading processed datasets from `data/exports`

Not implemented yet:

- OCR inference
- Rotated box editing
- Multi-page batch LabelMe matching
- Train command generation for PaddleOCR
- Dataset quality dashboard
