import cors from "cors";
import express from "express";
import multer from "multer";
import { imageSize } from "image-size";
import { nanoid } from "nanoid";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_ROOT = path.join(ROOT, "data");
const PROJECTS_DIR = path.join(DATA_ROOT, "projects");
const EXPORTS_DIR = path.join(DATA_ROOT, "exports");
const UPLOADS_DIR = path.join(DATA_ROOT, "uploads");
const PORT = Number(process.env.PORT || 4177);

const app = express();
const upload = multer({ dest: UPLOADS_DIR });

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use("/files", express.static(DATA_ROOT));

await ensureDirs([DATA_ROOT, PROJECTS_DIR, EXPORTS_DIR, UPLOADS_DIR]);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/projects", async (_req, res, next) => {
  try {
    const projects = await listProjects();
    res.json({ projects });
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects", async (req, res, next) => {
  try {
    const name = cleanName(req.body?.name || "GD&T Project");
    const now = new Date().toISOString();
    const id = nanoid(10);
    const project = {
      id,
      name,
      createdAt: now,
      updatedAt: now,
      pages: []
    };
    await ensureProjectDirs(id);
    await saveProject(project);
    res.status(201).json({ project });
  } catch (error) {
    next(error);
  }
});

app.get("/api/projects/:id", async (req, res, next) => {
  try {
    res.json({ project: await readProject(req.params.id) });
  } catch (error) {
    next(error);
  }
});

app.put("/api/projects/:id", async (req, res, next) => {
  try {
    const existing = await readProject(req.params.id);
    const incoming = req.body?.project;
    if (!incoming || incoming.id !== existing.id) {
      return res.status(400).json({ error: "Invalid project payload." });
    }
    const project = {
      ...incoming,
      name: cleanName(incoming.name || existing.name),
      updatedAt: new Date().toISOString()
    };
    await saveProject(project);
    res.json({ project });
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:id/import", upload.single("file"), async (req, res, next) => {
  try {
    const project = await readProject(req.params.id);
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const originalName = req.file.originalname || "input";
    const ext = path.extname(originalName).toLowerCase();
    const dpi = clampNumber(Number(req.body?.dpi || 300), 100, 600);
    const pagesDir = projectPagesDir(project.id);
    await ensureDirs([pagesDir]);

    let pages = [];
    if (ext === ".pdf") {
      const prefix = `${Date.now()}_${slugBase(originalName)}_p`;
      const worker = await runCommand("uv", [
        "run",
        "--project",
        ROOT,
        "python",
        "scripts/pdf_to_images.py",
        "--input",
        req.file.path,
        "--output",
        pagesDir,
        "--prefix",
        prefix,
        "--dpi",
        String(dpi)
      ]);
      const manifest = JSON.parse(worker.stdout);
      pages = manifest.pages.map((page) => toProjectPage(project.id, page, originalName, dpi));
    } else if ([".png", ".jpg", ".jpeg"].includes(ext)) {
      const safeName = `${Date.now()}_${slugBase(originalName)}${ext}`;
      const target = path.join(pagesDir, safeName);
      await fs.copyFile(req.file.path, target);
      const size = imageSize(await fs.readFile(target));
      pages = [
        {
          id: nanoid(10),
          sourceName: originalName,
          imagePath: toDataPath(target),
          width: Number(size.width),
          height: Number(size.height),
          dpi: null,
          annotations: []
        }
      ];
    } else {
      return res.status(400).json({ error: "Supported files: PDF, PNG, JPG." });
    }

    await fs.rm(req.file.path, { force: true });
    project.pages.push(...pages);
    project.updatedAt = new Date().toISOString();
    await saveProject(project);
    res.status(201).json({ project, pages });
  } catch (error) {
    if (req.file?.path) {
      await fs.rm(req.file.path, { force: true }).catch(() => {});
    }
    next(error);
  }
});

app.post("/api/projects/:id/export", async (req, res, next) => {
  try {
    const project = await readProject(req.params.id);
    const valRatio = clampNumber(Number(req.body?.valRatio ?? 0.1), 0, 0.5);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const exportDir = path.join(EXPORTS_DIR, `${project.id}_${timestamp}`);
    const exportImagesDir = path.join(exportDir, "images");
    await ensureDirs([exportImagesDir]);

    const pageEntries = [];
    for (let index = 0; index < project.pages.length; index += 1) {
      const page = project.pages[index];
      const source = path.join(DATA_ROOT, fromDataPath(page.imagePath));
      const ext = path.extname(source) || ".png";
      const imageName = `${String(index + 1).padStart(4, "0")}_${slugBase(page.sourceName || page.id)}${ext}`;
      const target = path.join(exportImagesDir, imageName);
      await fs.copyFile(source, target);
      pageEntries.push({
        image: `images/${imageName}`,
        label: formatPaddleAnnotations(page.annotations || [])
      });
    }

    const valCount = computeValCount(pageEntries.length, valRatio);
    const trainEntries = pageEntries.slice(0, pageEntries.length - valCount);
    const valEntries = pageEntries.slice(pageEntries.length - valCount);
    await fs.writeFile(path.join(exportDir, "train.txt"), toLabelFile(trainEntries), "utf8");
    await fs.writeFile(path.join(exportDir, "val.txt"), toLabelFile(valEntries), "utf8");
    await fs.writeFile(
      path.join(exportDir, "manifest.json"),
      JSON.stringify(
        {
          projectId: project.id,
          projectName: project.name,
          exportedAt: new Date().toISOString(),
          totalPages: pageEntries.length,
          trainPages: trainEntries.length,
          valPages: valEntries.length
        },
        null,
        2
      ),
      "utf8"
    );

    res.json({
      exportDir,
      trainFile: path.join(exportDir, "train.txt"),
      valFile: path.join(exportDir, "val.txt"),
      trainPages: trainEntries.length,
      valPages: valEntries.length
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || "Internal server error." });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`API server listening on http://127.0.0.1:${PORT}`);
});

async function listProjects() {
  await ensureDirs([PROJECTS_DIR]);
  const dirs = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
  const projects = [];
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    try {
      const project = await readProject(dir.name);
      projects.push({
        id: project.id,
        name: project.name,
        updatedAt: project.updatedAt,
        pageCount: project.pages.length
      });
    } catch {
      // Ignore incomplete project directories.
    }
  }
  return projects.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

async function readProject(id) {
  assertSafeId(id);
  const file = projectFile(id);
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw);
}

async function saveProject(project) {
  assertSafeId(project.id);
  await ensureProjectDirs(project.id);
  await fs.writeFile(projectFile(project.id), JSON.stringify(project, null, 2), "utf8");
}

function projectFile(id) {
  return path.join(PROJECTS_DIR, id, "project.json");
}

function projectPagesDir(id) {
  return path.join(PROJECTS_DIR, id, "pages");
}

async function ensureProjectDirs(id) {
  await ensureDirs([path.join(PROJECTS_DIR, id), projectPagesDir(id)]);
}

async function ensureDirs(dirs) {
  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }
}

function toProjectPage(projectId, page, sourceName, dpi) {
  const imagePath = path.join(projectPagesDir(projectId), page.fileName);
  return {
    id: nanoid(10),
    sourceName: `${sourceName} page ${page.pageNumber}`,
    imagePath: toDataPath(imagePath),
    width: page.width,
    height: page.height,
    dpi,
    annotations: []
  };
}

function formatPaddleAnnotations(annotations) {
  return annotations
    .filter((annotation) => Array.isArray(annotation.points) && annotation.points.length >= 4)
    .map((annotation) => ({
      transcription: annotation.ignore ? "###" : String(annotation.transcription || "").trim(),
      points: normalizePoints(annotation.points)
    }));
}

function normalizePoints(points) {
  return points.slice(0, 4).map(([x, y]) => [Math.round(Number(x)), Math.round(Number(y))]);
}

function toLabelFile(entries) {
  return entries.map((entry) => `${entry.image}\t${JSON.stringify(entry.label)}`).join("\n") + (entries.length ? "\n" : "");
}

function computeValCount(total, ratio) {
  if (total <= 1 || ratio <= 0) return 0;
  return Math.min(total - 1, Math.max(1, Math.round(total * ratio)));
}

function toDataPath(filePath) {
  return path.relative(DATA_ROOT, filePath).split(path.sep).join("/");
}

function fromDataPath(dataPath) {
  return String(dataPath).split("/").join(path.sep);
}

function cleanName(value) {
  return String(value).trim().replace(/\s+/g, " ").slice(0, 80) || "GD&T Project";
}

function slugBase(value) {
  const parsed = path.parse(value);
  return (parsed.name || "file")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "file";
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function assertSafeId(id) {
  if (!/^[a-zA-Z0-9_-]+$/.test(String(id))) {
    throw new Error("Invalid project id.");
  }
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      shell: false,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || `${command} exited with code ${code}`));
      }
    });
  });
}
