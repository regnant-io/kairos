# Kairos — AI Teacher Copilot for Tanzania

> **100% offline AI** that runs on school computers with 4 GB RAM.  
> Generate lesson plans, exams, mark scripts, and write reports in seconds.  
> Built specifically for the Tanzanian secondary school curriculum (TIE / NECTA).

---

## What Kairos Does

| Feature | What you get |
|---|---|
| **Lesson Planner** | Full TIE-format lesson plan in ~90 seconds: objectives (knowledge/skills/attitudes), time plan, Tanzanian examples, homework, assessment, references |
| **Exam Generator** | NECTA-style papers with multiple choice, short answer, structured essays — includes complete marking scheme |
| **Marking Assistant** | AI marks student written answers question-by-question with confidence score, feedback, and error analysis |
| **Report Writer** | Batch-generate professional report comments for entire class in one click |
| **Class Insights** | Identify weakest topics, students at risk, and NECTA readiness score with AI-generated action plan |
| **USB/LAN Sync** | Share lessons and data between teachers without internet |

---

## System Requirements

| Component | Minimum | Recommended |
|---|---|---|
| RAM | 4 GB | 8 GB |
| Storage | 5 GB free | 10 GB free |
| CPU | Any x64 / ARM64 | 4+ core |
| OS | Windows 10, Ubuntu 20.04, macOS 12 | Windows 11, Ubuntu 22.04, macOS 14 |
| Internet | **Not required** | Only for initial setup |

---

## Quick Start

### 1. Install dependencies

```bash
# Clone the repo
git clone https://github.com/kairos-education/kairos.git
cd kairos

# Install Node dependencies
npm install
```

### 2. Build the llama.cpp server

```bash
# macOS / Linux
chmod +x scripts/build-llama.sh
./scripts/build-llama.sh

# Windows (PowerShell — requires CMake and Visual Studio Build Tools)
# Download llama-server.exe from https://github.com/ggerganov/llama.cpp/releases
# Place it in: binaries/win-x64/llama-server.exe
```

### 3. Download an AI model

```bash
# macOS / Linux — downloads Llama 3.2 3B (~2.2 GB, recommended for most computers)
chmod +x scripts/download-model.sh
./scripts/download-model.sh llama32-3b

# Windows PowerShell
.\scripts\download-model.ps1 -ModelId llama32-3b

# Other model options:
#   llama31-8b   — higher quality, needs 8 GB RAM
#   phi35-mini   — fastest, needs 4 GB RAM
```

### 4. Run in development

```bash
npm run dev
```

### 5. Build for distribution

```bash
# Build for current platform
npm run package

# Cross-platform builds
npm run package:win    # Windows NSIS installer
npm run package:linux  # AppImage + .deb
npm run package:mac    # DMG for Intel + Apple Silicon
```

---

## Project Structure

```
kairos/
├── src/
│   ├── main/                    # Electron main process (Node.js)
│   │   ├── app.ts               # App lifecycle, window creation
│   │   ├── services/
│   │   │   ├── LlamaService.ts  # llama.cpp server management
│   │   │   ├── DatabaseService.ts # SQLite with all queries
│   │   │   ├── PromptService.ts # Tanzania-specific AI prompts
│   │   │   ├── DocumentService.ts # PDF/DOCX/Image parsing
│   │   │   └── ExportService.ts # PDF/DOCX export
│   │   ├── ipc/
│   │   │   ├── ai.ipc.ts        # AI generation handlers
│   │   │   ├── db.ipc.ts        # Database CRUD handlers
│   │   │   ├── file.ipc.ts      # File operations handlers
│   │   │   └── sync.ipc.ts      # USB/LAN sync handlers
│   │   └── windows/
│   │       └── MainWindow.ts
│   │
│   ├── preload/
│   │   └── index.ts             # Secure contextBridge
│   │
│   ├── renderer/                # React frontend
│   │   ├── index.html
│   │   └── src/
│   │       ├── App.tsx          # Router + event subscriptions
│   │       ├── pages/
│   │       │   ├── OnboardingPage.tsx
│   │       │   ├── DashboardPage.tsx
│   │       │   ├── LessonPage.tsx
│   │       │   ├── ExamPage.tsx
│   │       │   ├── MarkingPage.tsx
│   │       │   ├── ReportsPage.tsx
│   │       │   ├── AnalyticsPage.tsx
│   │       │   └── SettingsPage.tsx
│   │       ├── components/
│   │       │   ├── layout/AppShell.tsx
│   │       │   └── ui/
│   │       │       ├── Primitives.tsx
│   │       │       ├── Toast.tsx
│   │       │       └── utils.ts
│   │       ├── stores/index.ts  # Zustand state management
│   │       ├── hooks/useIPC.ts  # Type-safe IPC bridge
│   │       └── i18n/config.ts   # English + Kiswahili translations
│   │
│   └── shared/                  # Types shared between main and renderer
│       ├── db-types.ts          # All database entity types
│       ├── ai-types.ts          # AI request/response types
│       └── ipc-types.ts        # IPC channel type definitions
│
├── assets/
│   ├── curriculum/tz-curriculum.json  # TIE curriculum topic data
│   ├── necta/marking-conventions.json # NECTA grading rules
│   └── i18n/                    # Additional language files
│
├── binaries/                    # Platform-specific llama-server binaries
│   ├── win-x64/
│   ├── linux-x64/
│   └── darwin-arm64/
│
├── models/                      # GGUF model files (not in git)
│   └── *.gguf
│
├── scripts/
│   ├── build-llama.sh           # Compile llama.cpp from source
│   ├── download-model.sh        # Download GGUF models (Linux/macOS)
│   └── download-model.ps1       # Download GGUF models (Windows)
│
├── resources/                   # App icons for packaging
├── electron.vite.config.ts
├── electron-builder.yml
├── tailwind.config.js
└── package.json
```

---

## AI Architecture

Kairos runs **llama.cpp** as a local HTTP server on `127.0.0.1:11434`.

```
Renderer (React) → IPC → Main Process → LlamaService → llama-server (port 11434)
                                       ↓
                              DatabaseService (SQLite)
                              PromptService (Tanzania prompts)
                              DocumentService (OCR/PDF/DOCX)
                              ExportService (PDF/DOCX output)
```

### How generation works
1. Teacher fills a form and clicks "Generate"
2. `PromptService` builds a Tanzania-specific structured prompt
3. `LlamaService` streams tokens from `llama-server` via HTTP
4. Tokens stream live to the renderer via Electron IPC events
5. When complete, the JSON response is parsed and displayed
6. Teacher can save, edit, and export

### Prompt design principles
- Always instructs the model to return **JSON only** (no prose)
- Includes Tanzania-specific examples (Serengeti, Kilimanjaro, Lake Victoria, TANESCO)
- References actual **TIE textbooks** with chapter and page numbers
- Follows **NECTA marking conventions** for exam generation
- Uses **Bloom's Taxonomy** for learning objectives
- Assumes **40-60 student classes** with limited lab equipment

---

## Database Schema

SQLite database stored at `~/AppData/Roaming/kairos/kairos.db` (Windows)  
or `~/.config/kairos/kairos.db` (Linux) or `~/Library/Application Support/kairos/kairos.db` (macOS).

**Tables:**
- `teachers` — teacher profile (one row)
- `lessons` — all generated lesson plans (JSON stored in `content`)
- `exams` — exam papers (JSON stored in `questions`, `marking_scheme`)
- `students` — student roster with class level
- `scores` — per-student per-exam scores with question-level breakdown
- `marking_sessions` — batch marking tracking
- `report_comments` — AI-generated and teacher-edited report comments
- `uploaded_documents` — parsed PDF/DOCX/image files
- `curriculum_topics` — TIE curriculum data (seeded from assets/)
- `generation_log` — usage analytics (local only)
- `app_settings` — key-value settings store

---

## Supported Languages

| Language | Status |
|---|---|
| English | Full support |
| Kiswahili | Full support (AI generates in Swahili when selected) |
| Bilingual | Mixed English/Swahili (great for Form 1-2) |

---

## Privacy & Data

- **All data stays on the device.** No cloud sync, no telemetry, no analytics sent anywhere.
- The AI model runs locally via llama.cpp — no API calls to OpenAI or Anthropic.
- Backups are encrypted `.kbak` files that teachers control.
- Student data never leaves the school computer.

---

## Adding New Models

Place any GGUF model in the `models/` directory. Kairos will:
1. Auto-detect installed models on startup
2. Select the best model based on available RAM
3. Prefer higher-quality models when RAM allows

Recommended models from HuggingFace:
- [`bartowski/Llama-3.2-3B-Instruct-GGUF`](https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF) — Q4_K_M variant
- [`bartowski/Meta-Llama-3.1-8B-Instruct-GGUF`](https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF) — Q4_K_M variant
- [`bartowski/Phi-3.5-mini-instruct-GGUF`](https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF) — Q4_K_M variant

---

## Contributing

Built for Tanzanian teachers. Contributions welcome — especially:
- More curriculum topics (Form 5-6, A-level subjects)
- Kiswahili UI improvements
- Additional subject prompt refinements
- NECTA past paper integrations

---

## License

MIT — use freely in schools, NGOs, and government education projects.

---

*Kairos — Greek: "the opportune moment." Every lesson is a moment that matters.*
