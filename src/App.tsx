import { AlertTriangle, Download, FileJson, Hand, MousePointer2, Pencil, Plus, Save, Trash2, Upload, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Image as KonvaImage, Layer, Rect, Stage, Text, Transformer } from "react-konva";
import type Konva from "konva";
import { createProject, exportProject, fileUrl, getProject, importFile, listProjects, saveProject } from "./api";
import { annotationToRect, clampRectToImage, labelMeShapesToAnnotations, rectToPoints, validateAnnotations } from "./geometry";
import type { Annotation, AnnotationType, ExportResult, Project, ProjectPage, ProjectSummary } from "./types";
import { useImageElement } from "./useImageElement";

type Tool = "select" | "draw" | "pan";

const symbols = ["±", "⌀", "°", "µm", "⊥", "∥", "⌖", "⌭", "|", "A", "B", "C"];
const annotationTypes: AnnotationType[] = ["dimension", "fcf", "datum", "note"];

export default function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("draw");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [dpi, setDpi] = useState(300);
  const [valRatio, setValRatio] = useState(0.1);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const labelMeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void boot();
  }, []);

  const activePage = useMemo(() => {
    return project?.pages.find((page) => page.id === activePageId) ?? project?.pages[0] ?? null;
  }, [activePageId, project]);

  const selectedAnnotation = useMemo(() => {
    return activePage?.annotations.find((annotation) => annotation.id === selectedAnnotationId) ?? null;
  }, [activePage, selectedAnnotationId]);

  const validation = useMemo(() => validateAnnotations(project?.pages.flatMap((page) => page.annotations) ?? []), [project]);

  async function boot() {
    setBusy(true);
    try {
      const summaries = await listProjects();
      if (summaries.length === 0) {
        const created = await createProject("GD&T PaddleOCR Dataset");
        setProjects([{ id: created.id, name: created.name, updatedAt: created.updatedAt, pageCount: 0 }]);
        setProject(created);
      } else {
        setProjects(summaries);
        const loaded = await getProject(summaries[0].id);
        setProject(loaded);
        setActivePageId(loaded.pages[0]?.id ?? null);
      }
    } catch (error) {
      setMessage(readError(error));
    } finally {
      setBusy(false);
    }
  }

  async function reloadProjects(nextProjectId?: string) {
    const summaries = await listProjects();
    setProjects(summaries);
    if (nextProjectId) {
      const loaded = await getProject(nextProjectId);
      setProject(loaded);
      setActivePageId(loaded.pages[0]?.id ?? null);
      setSelectedAnnotationId(null);
    }
  }

  async function handleCreateProject() {
    const name = window.prompt("Project name", "GD&T PaddleOCR Dataset");
    if (!name) return;
    setBusy(true);
    try {
      const created = await createProject(name);
      await reloadProjects(created.id);
      setDirty(false);
      setMessage("Project created.");
    } catch (error) {
      setMessage(readError(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleSelectProject(id: string) {
    if (dirty && !window.confirm("Unsaved changes will be discarded. Continue?")) return;
    setBusy(true);
    try {
      const loaded = await getProject(id);
      setProject(loaded);
      setActivePageId(loaded.pages[0]?.id ?? null);
      setSelectedAnnotationId(null);
      setDirty(false);
      setMessage("");
    } catch (error) {
      setMessage(readError(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    if (!project) return;
    setBusy(true);
    try {
      const saved = await saveProject(project);
      setProject(saved);
      setDirty(false);
      setMessage("Saved.");
      await reloadProjects();
    } catch (error) {
      setMessage(readError(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(file: File | undefined) {
    if (!project || !file) return;
    setBusy(true);
    setMessage(`Importing ${file.name}...`);
    try {
      if (dirty) {
        await saveProject(project);
        setDirty(false);
      }
      const updated = await importFile(project.id, file, dpi);
      setProject(updated);
      setActivePageId(updated.pages[updated.pages.length - 1]?.id ?? null);
      setSelectedAnnotationId(null);
      setMessage("Import completed.");
      await reloadProjects();
    } catch (error) {
      setMessage(readError(error));
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleImportLabelMe(file: File | undefined) {
    if (!project || !activePage || !file) return;
    try {
      const raw = JSON.parse(await file.text());
      const imported = labelMeShapesToAnnotations(raw);
      if (imported.length === 0) {
        setMessage("No shapes found in JSON.");
        return;
      }
      updatePage(activePage.id, {
        annotations: [...activePage.annotations, ...imported]
      });
      setSelectedAnnotationId(imported[0].id);
      setMessage(`Imported ${imported.length} annotations.`);
    } catch (error) {
      setMessage(readError(error));
    } finally {
      if (labelMeInputRef.current) labelMeInputRef.current.value = "";
    }
  }

  async function handleExport() {
    if (!project) return;
    setBusy(true);
    try {
      if (dirty) {
        const saved = await saveProject(project);
        setProject(saved);
        setDirty(false);
      }
      const result = await exportProject(project.id, valRatio);
      setExportResult(result);
      setMessage("Export completed.");
    } catch (error) {
      setMessage(readError(error));
    } finally {
      setBusy(false);
    }
  }

  function updatePage(pageId: string, patch: Partial<ProjectPage>) {
    if (!project) return;
    setProject({
      ...project,
      pages: project.pages.map((page) => (page.id === pageId ? { ...page, ...patch } : page))
    });
    setDirty(true);
  }

  const updateAnnotation = useCallback(
    (annotationId: string, patch: Partial<Annotation>) => {
      if (!project || !activePage) return;
      setProject({
        ...project,
        pages: project.pages.map((page) =>
          page.id === activePage.id
            ? {
                ...page,
                annotations: page.annotations.map((annotation) =>
                  annotation.id === annotationId ? { ...annotation, ...patch } : annotation
                )
              }
            : page
        )
      });
      setDirty(true);
    },
    [activePage, project]
  );

  const addAnnotation = useCallback(
    (annotation: Annotation) => {
      if (!project || !activePage) return;
      setProject({
        ...project,
        pages: project.pages.map((page) =>
          page.id === activePage.id ? { ...page, annotations: [...page.annotations, annotation] } : page
        )
      });
      setSelectedAnnotationId(annotation.id);
      setDirty(true);
    },
    [activePage, project]
  );

  function deleteSelectedAnnotation() {
    if (!activePage || !selectedAnnotationId) return;
    updatePage(activePage.id, {
      annotations: activePage.annotations.filter((annotation) => annotation.id !== selectedAnnotationId)
    });
    setSelectedAnnotationId(null);
  }

  function updateSelected(patch: Partial<Annotation>) {
    if (!selectedAnnotation) return;
    updateAnnotation(selectedAnnotation.id, patch);
  }

  function appendSymbol(symbol: string) {
    if (!selectedAnnotation) return;
    updateSelected({ transcription: `${selectedAnnotation.transcription}${symbol}` });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>GD&T Data Handler</strong>
          <span>PaddleOCR detection</span>
        </div>

        <button className="primary-action" onClick={handleCreateProject} disabled={busy}>
          <Plus size={16} />
          New project
        </button>

        <section className="stack">
          <h2>Projects</h2>
          <div className="project-list">
            {projects.map((summary) => (
              <button
                key={summary.id}
                className={summary.id === project?.id ? "list-row active" : "list-row"}
                onClick={() => void handleSelectProject(summary.id)}
              >
                <span>{summary.name}</span>
                <small>{summary.pageCount} pages</small>
              </button>
            ))}
          </div>
        </section>

        <section className="stack">
          <h2>Pages</h2>
          <div className="page-list">
            {project?.pages.map((page, index) => (
              <button
                key={page.id}
                className={page.id === activePage?.id ? "page-row active" : "page-row"}
                onClick={() => {
                  setActivePageId(page.id);
                  setSelectedAnnotationId(null);
                }}
              >
                <span>Page {index + 1}</span>
                <small>{page.annotations.length} boxes</small>
              </button>
            ))}
          </div>
        </section>
      </aside>

      <main className="workspace">
        <header className="toolbar">
          <div className="toolbar-group">
            <button className={tool === "select" ? "icon-button active" : "icon-button"} title="Select" onClick={() => setTool("select")}>
              <MousePointer2 size={18} />
            </button>
            <button className={tool === "draw" ? "icon-button active" : "icon-button"} title="Draw box" onClick={() => setTool("draw")}>
              <Pencil size={18} />
            </button>
            <button className={tool === "pan" ? "icon-button active" : "icon-button"} title="Pan" onClick={() => setTool("pan")}>
              <Hand size={18} />
            </button>
          </div>

          <div className="toolbar-group">
            <button className="icon-button" title="Zoom out" onClick={() => setZoom((value) => Math.max(0.15, value - 0.1))}>
              <ZoomOut size={18} />
            </button>
            <span className="zoom-label">{Math.round(zoom * 100)}%</span>
            <button className="icon-button" title="Zoom in" onClick={() => setZoom((value) => Math.min(6, value + 0.1))}>
              <ZoomIn size={18} />
            </button>
          </div>

          <div className="toolbar-group">
            <label className="inline-control">
              DPI
              <input type="number" min={100} max={600} value={dpi} onChange={(event) => setDpi(Number(event.target.value))} />
            </label>
            <input
              ref={fileInputRef}
              className="hidden"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(event) => void handleImport(event.target.files?.[0])}
            />
            <button className="text-button" onClick={() => fileInputRef.current?.click()} disabled={!project || busy}>
              <Upload size={16} />
              Import
            </button>
          </div>

          <div className="toolbar-spacer" />

          <button className="text-button" onClick={() => void handleSave()} disabled={!project || busy || !dirty}>
            <Save size={16} />
            Save
          </button>
          <button className="text-button strong" onClick={() => void handleExport()} disabled={!project || busy || project.pages.length === 0}>
            <Download size={16} />
            Export
          </button>
        </header>

        <section className="canvas-zone">
          {activePage ? (
            <AnnotationCanvas
              page={activePage}
              selectedAnnotationId={selectedAnnotationId}
              tool={tool}
              zoom={zoom}
              pan={pan}
              onPan={setPan}
              onZoom={setZoom}
              onSelect={setSelectedAnnotationId}
              onAddAnnotation={addAnnotation}
              onUpdateAnnotation={updateAnnotation}
            />
          ) : (
            <div className="empty-state">
              <Upload size={28} />
              <span>No page loaded</span>
            </div>
          )}
        </section>

        <footer className="statusbar">
          <span>{busy ? "Working..." : dirty ? "Unsaved changes" : "Ready"}</span>
          {validation.empty || validation.invalid ? (
            <span className="warning">
              <AlertTriangle size={14} />
              {validation.empty} empty, {validation.invalid} invalid
            </span>
          ) : null}
          {message ? <span>{message}</span> : null}
        </footer>
      </main>

      <aside className="inspector">
        <section className="panel">
          <h2>Annotation</h2>
          {selectedAnnotation ? (
            <div className="form-stack">
              <label>
                Transcription
                <input
                  value={selectedAnnotation.transcription}
                  onChange={(event) => updateSelected({ transcription: event.target.value })}
                  disabled={selectedAnnotation.ignore}
                />
              </label>
              <div className="symbol-grid">
                {symbols.map((symbol) => (
                  <button key={symbol} onClick={() => appendSymbol(symbol)} disabled={selectedAnnotation.ignore}>
                    {symbol}
                  </button>
                ))}
              </div>
              <label>
                Type
                <select value={selectedAnnotation.type} onChange={(event) => updateSelected({ type: event.target.value as AnnotationType })}>
                  {annotationTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={Boolean(selectedAnnotation.ignore)}
                  onChange={(event) => updateSelected({ ignore: event.target.checked })}
                />
                Ignore as ###
              </label>
              <button className="danger-button" onClick={deleteSelectedAnnotation}>
                <Trash2 size={16} />
                Delete
              </button>
            </div>
          ) : (
            <p className="muted">No box selected.</p>
          )}
        </section>

        <section className="panel">
          <h2>Boxes</h2>
          <input
            ref={labelMeInputRef}
            className="hidden"
            type="file"
            accept=".json"
            onChange={(event) => void handleImportLabelMe(event.target.files?.[0])}
          />
          <button className="text-button full" onClick={() => labelMeInputRef.current?.click()} disabled={!activePage}>
            <FileJson size={16} />
            Import LabelMe JSON
          </button>
          <div className="annotation-list">
            {activePage?.annotations.map((annotation, index) => (
              <button
                key={annotation.id}
                className={annotation.id === selectedAnnotationId ? "annotation-row active" : "annotation-row"}
                onClick={() => setSelectedAnnotationId(annotation.id)}
              >
                <span>{annotation.ignore ? "###" : annotation.transcription || "(empty)"}</span>
                <small>#{index + 1} {annotation.type}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Export</h2>
          <label>
            Val ratio
            <input
              type="number"
              min={0}
              max={0.5}
              step={0.05}
              value={valRatio}
              onChange={(event) => setValRatio(Number(event.target.value))}
            />
          </label>
          {exportResult ? (
            <div className="export-result">
              <strong>{exportResult.trainPages} train / {exportResult.valPages} val</strong>
              <span>{exportResult.exportDir}</span>
            </div>
          ) : null}
        </section>
      </aside>
    </div>
  );
}

function AnnotationCanvas(props: {
  page: ProjectPage;
  selectedAnnotationId: string | null;
  tool: Tool;
  zoom: number;
  pan: { x: number; y: number };
  onPan: (pan: { x: number; y: number }) => void;
  onZoom: (zoom: number) => void;
  onSelect: (id: string | null) => void;
  onAddAnnotation: (annotation: Annotation) => void;
  onUpdateAnnotation: (id: string, patch: Partial<Annotation>) => void;
}) {
  const { page, selectedAnnotationId, tool, zoom, pan, onPan, onZoom, onSelect, onAddAnnotation, onUpdateAnnotation } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const rectRefs = useRef<Record<string, Konva.Rect | null>>({});
  const fittedPageRef = useRef<string | null>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [draft, setDraft] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const draftStart = useRef<{ x: number; y: number } | null>(null);
  const { image } = useImageElement(fileUrl(page.imagePath));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = selectedAnnotationId ? rectRefs.current[selectedAnnotationId] : null;
    if (node && transformerRef.current) {
      transformerRef.current.nodes([node]);
      transformerRef.current.getLayer()?.batchDraw();
    } else {
      transformerRef.current?.nodes([]);
    }
  }, [selectedAnnotationId, page.annotations]);

  useEffect(() => {
    if (fittedPageRef.current === page.id || size.width < 100 || size.height < 100) return;
    const nextZoom = Math.max(0.12, Math.min(1, Math.min((size.width - 72) / page.width, (size.height - 72) / page.height)));
    onZoom(nextZoom);
    onPan({
      x: Math.max(24, (size.width - page.width * nextZoom) / 2),
      y: Math.max(24, (size.height - page.height * nextZoom) / 2)
    });
    fittedPageRef.current = page.id;
  }, [onPan, onZoom, page.height, page.id, page.width, size.height, size.width]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDraft(null);
        draftStart.current = null;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function imagePoint() {
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!pointer) return null;
    return {
      x: (pointer.x - pan.x) / zoom,
      y: (pointer.y - pan.y) / zoom
    };
  }

  function isInsideImage(point: { x: number; y: number }) {
    return point.x >= 0 && point.y >= 0 && point.x <= page.width && point.y <= page.height;
  }

  function handleMouseDown(event: Konva.KonvaEventObject<MouseEvent>) {
    if (event.target !== event.target.getStage()) {
      return;
    }
    onSelect(null);
    if (tool !== "draw") return;
    const point = imagePoint();
    if (!point || !isInsideImage(point)) return;
    draftStart.current = point;
    setDraft({ x: point.x, y: point.y, width: 1, height: 1 });
  }

  function handleMouseMove() {
    if (!draftStart.current || tool !== "draw") return;
    const point = imagePoint();
    if (!point) return;
    const clamped = {
      x: Math.max(0, Math.min(page.width, point.x)),
      y: Math.max(0, Math.min(page.height, point.y))
    };
    setDraft({
      x: draftStart.current.x,
      y: draftStart.current.y,
      width: clamped.x - draftStart.current.x,
      height: clamped.y - draftStart.current.y
    });
  }

  function handleMouseUp() {
    if (!draft || !draftStart.current) return;
    const points = rectToPoints(draft.x, draft.y, draft.width, draft.height);
    const rect = annotationToRect({ id: "draft", type: "dimension", transcription: "", points });
    setDraft(null);
    draftStart.current = null;
    if (rect.width < 4 || rect.height < 4) return;
    onAddAnnotation({
      id: crypto.randomUUID(),
      type: "dimension",
      transcription: "",
      points,
      ignore: false
    });
  }

  function handleWheel(event: Konva.KonvaEventObject<WheelEvent>) {
    event.evt.preventDefault();
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    const factor = event.evt.deltaY > 0 ? 0.9 : 1.1;
    const nextZoom = Math.max(0.15, Math.min(6, zoom * factor));
    const imageUnderMouse = {
      x: (pointer.x - pan.x) / zoom,
      y: (pointer.y - pan.y) / zoom
    };
    onZoom(nextZoom);
    onPan({
      x: pointer.x - imageUnderMouse.x * nextZoom,
      y: pointer.y - imageUnderMouse.y * nextZoom
    });
  }

  function handleDragMove(event: Konva.KonvaEventObject<DragEvent>, annotation: Annotation) {
    const node = event.target;
    const rect = clampRectToImage(
      {
        x: node.x(),
        y: node.y(),
        width: annotationToRect(annotation).width,
        height: annotationToRect(annotation).height
      },
      page.width,
      page.height
    );
    node.x(rect.x);
    node.y(rect.y);
  }

  function handleDragEnd(event: Konva.KonvaEventObject<DragEvent>, annotation: Annotation) {
    const rect = annotationToRect(annotation);
    const next = clampRectToImage({ x: event.target.x(), y: event.target.y(), width: rect.width, height: rect.height }, page.width, page.height);
    onUpdateAnnotation(annotation.id, { points: rectToPoints(next.x, next.y, next.width, next.height) });
  }

  function handleTransformEnd(annotation: Annotation) {
    const node = rectRefs.current[annotation.id];
    if (!node) return;
    const rect = clampRectToImage(
      {
        x: node.x(),
        y: node.y(),
        width: Math.max(1, node.width() * node.scaleX()),
        height: Math.max(1, node.height() * node.scaleY())
      },
      page.width,
      page.height
    );
    node.scaleX(1);
    node.scaleY(1);
    onUpdateAnnotation(annotation.id, { points: rectToPoints(rect.x, rect.y, rect.width, rect.height) });
  }

  return (
    <div ref={containerRef} className="canvas-wrap">
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        draggable={tool === "pan"}
        x={tool === "pan" ? pan.x : 0}
        y={tool === "pan" ? pan.y : 0}
        onDragEnd={(event) => {
          if (tool === "pan") onPan({ x: event.target.x(), y: event.target.y() });
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      >
        <Layer>
          <Group x={tool === "pan" ? 0 : pan.x} y={tool === "pan" ? 0 : pan.y} scaleX={zoom} scaleY={zoom}>
            {image ? <KonvaImage image={image} width={page.width} height={page.height} listening={false} /> : null}
            <Rect width={page.width} height={page.height} stroke="#cad2dc" strokeWidth={1 / zoom} listening={false} />
            {page.annotations.map((annotation, index) => {
              const rect = annotationToRect(annotation);
              const selected = annotation.id === selectedAnnotationId;
              return (
                <Group key={annotation.id}>
                  <Rect
                    ref={(node) => {
                      rectRefs.current[annotation.id] = node;
                    }}
                    x={rect.x}
                    y={rect.y}
                    width={rect.width}
                    height={rect.height}
                    fill={annotation.ignore ? "rgba(117, 117, 117, 0.16)" : "rgba(0, 139, 139, 0.12)"}
                    stroke={selected ? "#f97316" : annotation.ignore ? "#747474" : "#008b8b"}
                    strokeWidth={(selected ? 2 : 1.2) / zoom}
                    draggable={tool === "select"}
                    onClick={(event) => {
                      event.cancelBubble = true;
                      onSelect(annotation.id);
                    }}
                    onTap={(event) => {
                      event.cancelBubble = true;
                      onSelect(annotation.id);
                    }}
                    onDragMove={(event) => handleDragMove(event, annotation)}
                    onDragEnd={(event) => handleDragEnd(event, annotation)}
                    onTransformEnd={() => handleTransformEnd(annotation)}
                  />
                  <Text
                    x={rect.x}
                    y={Math.max(0, rect.y - 18)}
                    text={`${index + 1}: ${annotation.ignore ? "###" : annotation.transcription || "empty"}`}
                    fontSize={12 / zoom}
                    fill={selected ? "#f97316" : "#135e5e"}
                    listening={false}
                  />
                </Group>
              );
            })}
            {draft ? (
              <Rect
                x={Math.min(draft.x, draft.x + draft.width)}
                y={Math.min(draft.y, draft.y + draft.height)}
                width={Math.abs(draft.width)}
                height={Math.abs(draft.height)}
                fill="rgba(249, 115, 22, 0.12)"
                stroke="#f97316"
                strokeWidth={1.5 / zoom}
                dash={[8 / zoom, 6 / zoom]}
              />
            ) : null}
            <Transformer
              ref={transformerRef}
              rotateEnabled={false}
              enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right", "top-center", "bottom-center"]}
              boundBoxFunc={(_oldBox, newBox) => (newBox.width < 4 || newBox.height < 4 ? _oldBox : newBox)}
            />
          </Group>
        </Layer>
      </Stage>
    </div>
  );
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
