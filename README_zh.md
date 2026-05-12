# GD&T PaddleOCR Data Handler

本工具用來快速製作 PaddleOCR text detection fine-tune 資料，目標場景是工程圖上的 dimension、GD&T、datum 等區域標註。

這個 app 不會執行 OCR。它只負責把最耗時的人工標註流程做順：匯入 PDF/圖片、轉成可標註影像、手動畫框、手動輸入文字、以 export 資料夾保存工作狀態，最後匯出 PaddleOCR detection 訓練格式。

## 使用情境

適合標註：

- 尺寸文字，例如 `200±0.05`、`R5`、`8X ⌀10`
- Datum，例如 `A`、`B`、`C`
- 幾何公差框或 GD&T 符號群
- 對 detection 有訓練價值的工程圖 notes

匯出格式符合 PaddleOCR text detection label 格式：

```txt
images/page_001.png	[{"transcription":"200±0.05","points":[[100,50],[180,50],[180,80],[100,80]]}]
```

`points` 是圖片座標中的四點框。若標成 ignore，會輸出 `"transcription":"###"`。

## 技術架構

- 前端：Vite、React、TypeScript、Konva / React-Konva
- 後端：Node.js、Express
- PDF 轉圖：透過 `uv` 執行 Python worker，使用 `PyMuPDF`
- 編輯快取：本地 JSON，放在 `data/projects`
- Dataset 正式資料：本地資料夾，放在 `data/exports`

## 環境需求

- 建議 Node.js 22 或以上
- npm
- uv

Python 依賴由 `uv` 管理，不要安裝到全域 Python。

## 安裝

```powershell
npm install
uv run --project . python scripts/pdf_to_images.py --help
```

第二個指令會在需要時建立 `.venv`，並確認 PDF worker 可執行。

## 啟動

```powershell
npm run dev
```

開啟：

```txt
http://127.0.0.1:5173
```

啟動後會同時跑：

- API server：`http://127.0.0.1:4177`
- Vite frontend：`http://127.0.0.1:5173`

## Build

```powershell
npm run build
```

此指令會做 TypeScript 檢查與 Vite production build。

## 基本流程

1. 匯入 PDF、PNG、JPG 或 JPEG。每次匯入會建立一個新的 dataset。
2. 或從左側選擇既有 dataset。左側清單會讀取 `data/exports/*/project.json`。
3. 若匯入 PDF，先設定 DPI。後端會把每頁轉成 PNG。
4. 在圖紙上框選 dimension / GD&T / datum 區域。
5. 手動輸入 transcription。
6. 若該區域要讓 PaddleOCR training 忽略，勾選 `Ignore as ###`。
7. 點 Save。Save 會覆蓋目前 dataset 的 `data/exports/<dataset_id>/`。
8. Export 按鈕保留，用來手動重建同一個 export 資料夾，不會產生 timestamp 新資料夾。

## UI 操作

- Select tool：選取、移動、縮放既有 box。
- Draw tool：在圖紙上拖曳建立新 box。
- Pan tool：拖動畫布視角。
- 滑鼠滾輪：以游標位置為中心縮放。
- Symbol buttons：把常用 dimension / GD&T 符號加入目前選取的 transcription。
- Import new：把新的 PDF/圖片匯入成新的 dataset。
- Import LabelMe JSON：把舊的 LabelMe-like JSON 匯入目前頁面。

## LabelMe JSON 匯入

支援含有 `shapes` array 的 LabelMe-like JSON。

支援：

- `rectangle`：兩點會轉成 PaddleOCR 四點框。
- `polygon`：取前四點並整理成 clockwise order。

文字內容會優先使用 `label`，若沒有則使用 `text`。

## 本地資料結構

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

`data/projects`、`data/exports`、`data/uploads` 都已加入 `.gitignore`。`data/projects` 是內部編輯快取；UI 重新載入已處理資料時，會讀取 `data/exports/<dataset_id>/project.json`。

## 匯出結果

Dataset 會輸出到固定資料夾：

```txt
data/exports/<dataset_id>/
```

Save 和 Export 都會覆蓋目前 dataset 的同一個資料夾。只有匯入新圖片/PDF 時，才會建立新的 dataset 資料夾。

每個 dataset 包含：

```txt
images/
train.txt
val.txt
project.json
manifest.json
```

UI 裡的 `Val ratio` 控制 validation split。如果 project 只有一頁，會全部放進 `train.txt`，`val.txt` 會是空的。

## 建議標註規範

大量標註前，先固定同一套規則：

- 一個尺寸群組標成一個 box。
- 一個 datum 標成一個 box。
- 第一版建議整個 feature control frame 標成一個 box。
- 純幾何線、箭頭、中心線、剖面線不要框，除非它們是 OCR 目標的一部分。
- Box 盡量貼近實際要辨識的文字或符號。
- 要忽略的區域用 `###`。

對 fine-tune 來說，標註一致性比一開始追求最複雜的框選規則更重要。

## 重要檔案

- `src/App.tsx`：主要標註 UI 與 canvas 流程
- `src/geometry.ts`：點位轉換、LabelMe 匯入、驗證 helper
- `src/api.ts`：前端 API client
- `server/index.mjs`：project 儲存、匯入 API、匯出 API
- `scripts/pdf_to_images.py`：PDF 轉 PNG worker
- `pyproject.toml`：Python worker 依賴

## 疑難排解

如果 PDF 匯入失敗，先確認 `uv` 與 worker：

```powershell
uv run --project . python scripts/pdf_to_images.py --help
```

如果頁面能開但 API 操作失敗，確認後端：

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:4177/api/health'
```

如果前端 port 被佔用，可修改 `vite.config.ts`，或先停止使用 `5173` 的 process。

## 目前範圍

已實作：

- 手動畫框標註
- Project save/load
- 圖片匯入
- PDF 轉 PNG 匯入
- LabelMe-like JSON 匯入
- 固定資料夾覆蓋式 PaddleOCR detection format 匯出
- 從 `data/exports` 重新載入已處理 dataset

尚未實作：

- OCR inference
- 旋轉框編輯
- 多頁 LabelMe 批次對應
- PaddleOCR 訓練指令產生
- Dataset quality dashboard
