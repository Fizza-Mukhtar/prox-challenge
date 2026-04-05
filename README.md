# Vulcan OmniPro 220 — AI Support Agent

> A multimodal reasoning agent that answers hard technical questions about the Vulcan OmniPro 220 welder — with interactive calculators, live schematics, and visual troubleshooting tools generated on the fly.

![Agent Demo](demo.png)

---

## Quick Start

```bash
git clone <your-fork>
cd prox-challenge

# Step 1 — Extract knowledge from manuals (one-time setup, ~30 seconds)
pip install pymupdf
python scripts/ingest.py
python scripts/build_index.py

# Step 2 — Install and configure the app
cd vulcan-agent
npm install
cp ../.env.example .env.local
# Open .env.local and add your ANTHROPIC_API_KEY

# Step 3 — Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and start asking questions.

---

## What It Does

Most product support agents retrieve text and return text. This agent retrieves text, images, and structured data from the manual — and responds with interactive tools that let users *explore* the answer, not just read it.

**Ask a duty cycle question** → get a live calculator with voltage/process/amperage sliders that updates in real time.

**Ask a polarity question** → get an SVG wiring schematic showing exactly which cable goes in which socket, with current flow arrows and material compatibility legend.

**Ask a troubleshooting question** → get a clickable decision tree that walks through causes and fixes step by step.

**Upload a photo of your weld** → get a diagnosis based on visual analysis of the weld quality.

---

## Try These Questions

```
What's the duty cycle for MIG welding at 200A on 240V?
I'm getting porosity in my flux-cored welds. Help me troubleshoot.
What polarity setup do I need for TIG welding?
What settings should I use for 1/4" mild steel MIG welding?
Show me how to set up the wire feed mechanism.
Which process should I use for thin sheet metal?
```

Or upload a photo of a weld and ask: *"What's wrong with this weld?"*

---

## Architecture

```
User Question (text + optional image)
            │
            ▼
┌───────────────────────────────────────────┐
│         Claude Sonnet Agent               │
│         Agentic tool-use loop             │
│                                           │
│  Tools:                                   │
│  • search_manual   — keyword search       │
│  • get_section     — section retrieval    │
│  • get_page_image  — show manual diagrams │
│  • generate_artifact — build visual tools │
└──────┬──────────┬──────────┬──────────────┘
       │          │          │
  text_index  enriched_   knowledge/
  .json       index.json  images/*.png
       │          │          │
       └──────────┴──────────┘
                  │
                  ▼
         generate_artifact
         (inner Claude call)
         generates HTML/SVG
                  │
                  ▼
┌───────────────────────────────────────────┐
│         Next.js Frontend                  │
│  Streaming chat UI                        │
│  Artifact renderer (sandboxed iframe)     │
│  Image upload + analysis                  │
└───────────────────────────────────────────┘
```

The agent runs a full agentic loop — it can call multiple tools in sequence, reason across the results, and decide what kind of visual best fits the answer before writing a single word of response text.

---

## Design Decisions

### 1. Image-first knowledge extraction

The Vulcan OmniPro 220 manual contains critical information that exists *only* in images — the duty cycle tables are formatted as visual matrices, the wiring schematic is a diagram, and the weld diagnosis section is photo-based. Text extraction alone misses all of this.

Every page of every PDF is extracted as a 2× resolution PNG using PyMuPDF. When the agent retrieves a section, it gets both the text *and* the image path. The agent can then call `get_page_image` to send the actual page image to the user — showing them the exact diagram from the manual rather than a text description of it.

### 2. Manual section indexing (not just vector search)

Vector search works well for general recall but fails on specific technical queries. "What's the duty cycle at 200A on 240V?" is not a semantic question — it requires finding an exact table and reading the right cell.

We solved this by manually reading the manual and creating a curated section index: exact page numbers for duty cycle tables, polarity diagrams, troubleshooting matrix, wire feed setup, wiring schematic, and more. The agent can call `get_section("duty_cycle")` and instantly retrieve the right pages with zero ambiguity.

This index is combined with keyword search as a fallback for open-ended questions. The two methods complement each other.

### 3. Claude-in-Claude artifact generation

When the agent decides a visual would help, it makes a second Claude API call specifically to generate a self-contained interactive tool. The outer agent handles *reasoning* (what does the user need? what data is relevant?). The inner call handles *rendering* (turn this data into a working calculator/diagram/flowchart).

The inner call receives the actual manual data as context — so the generated artifacts use real numbers from the manual, not guessed values. A duty cycle calculator built from the manual data will show 25% at 200A/240V because that's what the manual says, not because the model guessed.

This pattern mirrors how Claude.ai renders artifacts: the model generates code, the client renders it in a sandboxed environment. We implemented the same pattern — artifacts render in a sandboxed iframe with no parent page access.

### 4. Streaming agentic loop with real-time feedback

The API route runs a full while-loop until the agent stops calling tools. Each tool call streams feedback to the frontend immediately:

- "Searching manual..." appears when `search_manual` is called
- "Building interactive tool..." appears when `generate_artifact` is called
- Images appear inline as soon as `get_page_image` resolves

Users see the agent working in real time rather than waiting for a single response. This makes the experience feel like talking to someone who's actively looking things up, not waiting for a black box to respond.

### 5. Multimodal input

Users can upload photos alongside their questions. A welder in their garage can photograph a bad weld, upload it, and ask "what's wrong here?" — the agent analyzes the image visually using Claude's vision capabilities and cross-references it with the weld diagnosis section of the manual.

The image type is detected dynamically (jpeg/png/webp) to avoid media type mismatch errors from Claude's API.

---

## Knowledge Extraction Pipeline

```
files/owner-manual.pdf          (48 pages)
files/quick-start-guide.pdf     (2 pages)
files/selection-chart.pdf       (1 page)
         │
         ▼ scripts/ingest.py (PyMuPDF)
         │
         ├── knowledge/images/          ← every page as 2× PNG
         │   ├── owner_manual_page_001.png
         │   ├── owner_manual_page_019.png   ← duty cycle table
         │   ├── owner_manual_page_045.png   ← wiring schematic
         │   └── ...
         │
         └── knowledge/chunks.json      ← text + metadata per page
                  │
                  ▼ scripts/build_index.py
                  │
                  ├── knowledge/text_index.json       ← keyword search
                  ├── knowledge/section_index.json    ← curated section map
                  └── knowledge/enriched_index.json   ← sections with page data
```

The section index was built by manually reading the manual and recording exact page numbers for every critical section. This is the part that makes the agent accurate on hard questions — it's not guessing which pages are relevant, it knows.

---

## Artifact Types

| Question Type | Artifact Generated |
|---|---|
| Duty cycle | Interactive calculator — voltage/process/amperage sliders, visual gauge |
| Troubleshooting | Clickable decision tree — symptom → causes → fixes |
| Settings/what to use | Settings configurator — process + material + thickness → recommended settings |
| Polarity/wiring | SVG schematic — front panel diagram with cable routing and DCEP/DCEN labels |
| Setup/installation | Manual page image — exact diagram from the PDF |

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | Next.js 14 + Tailwind | App Router, API routes, fast dev server |
| Agent | Claude claude-sonnet-4-20250514 | Best multimodal reasoning + tool use |
| Artifact rendering | Sandboxed iframe | Safe JS execution, mirrors Claude.ai |
| Knowledge base | JSON + PNG files | Zero infrastructure, runs locally |
| PDF processing | PyMuPDF | Best image extraction quality |
| Streaming | Server-Sent Events | Real-time tool call feedback |

---

## Project Structure

```
prox-challenge/
├── files/                          # Original PDF manuals
│   ├── owner-manual.pdf
│   ├── quick-start-guide.pdf
│   └── selection-chart.pdf
│
├── scripts/
│   ├── ingest.py                   # PDF → page images + text chunks
│   └── build_index.py             # Build searchable + section index
│
├── knowledge/
│   ├── images/                     # 51 page images (2× resolution PNG)
│   ├── chunks.json                 # Raw text per page
│   ├── text_index.json             # Keyword-searchable index
│   ├── section_index.json          # Curated section map with page numbers
│   └── enriched_index.json         # Sections with resolved page data
│
└── vulcan-agent/                   # Next.js application
    ├── app/
    │   ├── page.tsx                # Chat UI with image upload
    │   └── api/chat/route.ts       # Agent loop + tool execution
    ├── components/
    │   ├── Message.tsx             # Renders text, images, artifacts
    │   └── Artifact.tsx            # Sandboxed iframe renderer
    └── lib/
        └── knowledge.ts            # Knowledge base query functions
```

---

## Hard Questions It Can Answer

These are the questions the challenge spec uses to evaluate submissions:

**"What's the duty cycle for MIG welding at 200A on 240V?"**
Retrieves the duty cycle section, generates an interactive calculator pre-loaded with manual data. Shows 25% duty cycle — 2.5 min weld, 7.5 min rest. Also shows the 100% continuous threshold at 115A.

**"I'm getting porosity in my flux-cored welds. What should I check?"**
Retrieves the troubleshooting section and weld diagnosis pages. Generates a clickable decision tree starting from porosity as the symptom, walking through polarity check (most common cause), shielding gas, wire condition, and base metal cleanliness.

**"What polarity setup do I need for TIG welding? Which socket does the ground clamp go in?"**
Retrieves polarity section and wiring schematic page. Shows the manual diagram AND generates an SVG wiring schematic with labeled sockets, cable routing, DCEN configuration label, and material compatibility legend.

---

## Requirements

- Node.js 18+
- Python 3.8+
- Anthropic API key (get one at [console.anthropic.com](https://console.anthropic.com))
- ~$0.05 per conversation (Claude Sonnet pricing)

---

*Built for the Prox Founding Engineer Challenge.*
