import Anthropic from "@anthropic-ai/sdk";
import {
  searchByKeyword,
  getSectionPages,
  getPageImageBase64,
  getSectionSummary,
} from "@/lib/knowledge";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are Vulcan — an expert AI support agent for the Vulcan OmniPro 220 multiprocess welder.

Your user just bought this welder and is in their garage trying to set it up or fix a problem. They're capable but not a professional welder. Talk like a knowledgeable friend, not a manual.

## Available Knowledge Sections
${getSectionSummary()}

## MANDATORY TOOL USAGE — NO EXCEPTIONS

### Step 1: ALWAYS search first
Every single response must start with search_manual or get_section. Never answer from memory.

### Step 2: ALWAYS generate a visual BEFORE writing text
You MUST call generate_artifact FIRST, then write your text explanation after.

- ANY mention of duty cycle → generate_artifact type="duty_cycle_calculator"
- ANY mention of troubleshooting, porosity, spatter, burn through, no arc, problems, not working, help me fix → generate_artifact type="troubleshooting_flowchart"
- ANY mention of settings, what wire, what voltage, what to use, recommend → generate_artifact type="settings_configurator"
- ANY mention of polarity, wiring, which socket, DCEP, DCEN, where does cable go → generate_artifact type="wiring_diagram" AND get_page_image for polarity page
- ANY mention of setup, installation, wire feed, spool → get_page_image for relevant pages

### Step 3: Text response after visual
After the visual, write 2-4 short sentences max. The visual does the heavy lifting.
Never write a long text answer when a visual has been shown.

## Tone
- Short sentences. No walls of text.
- Lead with the answer, then explain
- Say "Here's what you do" not "According to the manual"
- Flag safety issues briefly

## Critical Facts
- Supports MIG, Flux-Cored, TIG, and Stick
- Runs on 120V and 240V — duty cycle differs significantly
- Has synergic control — sets wire speed automatically in MIG mode
- POLARITY MUST match the process or welds will be terrible
- Flux-cored uses DCEN (electrode negative) — opposite of MIG
- TIG uses DCEN for steel, DCEP for aluminum`;

const tools: Anthropic.Tool[] = [
  {
    name: "search_manual",
    description:
      "Search the manual by keyword. Returns relevant page text and image paths. Use for any factual question.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Keywords to search for",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_section",
    description:
      "Get all pages for a specific manual section. Use when you know exactly which section is relevant.",
    input_schema: {
      type: "object" as const,
      properties: {
        section: {
          type: "string",
          enum: [
            "duty_cycle",
            "polarity_wiring",
            "polarity_per_process",
            "front_panel",
            "interior_controls",
            "wire_feed_setup",
            "assembly_diagram",
            "troubleshooting",
            "process_selection",
            "quick_start",
          ],
          description: "Which section to retrieve",
        },
      },
      required: ["section"],
    },
  },
  {
    name: "get_page_image",
    description:
      "Show a specific manual page image to the user. Use when the answer is best understood visually.",
    input_schema: {
      type: "object" as const,
      properties: {
        source: {
          type: "string",
          enum: ["owner_manual", "quick_start", "selection_chart"],
        },
        page_number: { type: "number" },
        caption: {
          type: "string",
          description: "What to tell the user about this image",
        },
      },
      required: ["source", "page_number", "caption"],
    },
  },
  {
    name: "generate_artifact",
    description:
      "Generate an interactive HTML tool. Use for duty cycle calculator, troubleshooting flowchart, settings configurator, or wiring diagram.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          enum: [
            "duty_cycle_calculator",
            "troubleshooting_flowchart",
            "settings_configurator",
            "wiring_diagram",
            "custom",
          ],
        },
        title: { type: "string" },
        context: {
          type: "string",
          description:
            "All relevant data from the manual to include in this artifact",
        },
      },
      required: ["type", "title", "context"],
    },
  },
];

// Generate artifact HTML via a separate Claude call
async function generateArtifactHTML(
  type: string,
  title: string,
  context: string
): Promise<{ html: string; artifactType: string }> {
  const baseRequirements = `
REQUIREMENTS:
- Single self-contained HTML file, all CSS and JS inline
- NO external dependencies, NO frameworks, vanilla JavaScript only
- CRITICAL: Use inline onclick attributes on ALL buttons — NOT addEventListener
- Example: <button onclick="selectVoltage('240V')">240V</button>
- NEVER use addEventListener anywhere in the code
- Define ALL functions in a <script> tag in the <head>
- Call update() at the very end of the script to set initial state
- Every interactive element must have onclick="functionName()" directly on the HTML tag

CORRECT PATTERN:
<head>
<script>
  let voltage = '240V';
  let process = 'MIG';
  
  function selectVoltage(v) {
    voltage = v;
    update();
  }
  
  function selectProcess(p) {
    process = p;
    update();
  }
  
  function update() {
    document.getElementById('output').textContent = voltage + ' ' + process;
    document.getElementById('v240').style.background = voltage === '240V' ? '#f59e0b' : '#374151';
    document.getElementById('v120').style.background = voltage === '120V' ? '#f59e0b' : '#374151';
  }
  
  window.onload = function() { update(); };
</script>
</head>
<body>
  <button id="v240" onclick="selectVoltage('240V')">240V</button>
  <button id="v120" onclick="selectVoltage('120V')">120V</button>
  <div id="output"></div>
</body>

WRONG PATTERN (never do this):
  document.getElementById('v240').addEventListener('click', ...)
  
Dark theme: background #111827, cards #1f2937, accent #f59e0b, white text
Return ONLY the HTML starting with <!DOCTYPE html>`;

  const prompts: Record<string, string> = {
    duty_cycle_calculator: `Create a fully interactive duty cycle calculator for the Vulcan OmniPro 220.

REAL DATA FROM THE MANUAL — use these exact numbers:
${context}

EXACT HTML STRUCTURE TO USE — do not change any id attributes:

<body>
  <div id="voltage-section">
    <button id="voltage-240" onclick="setVoltage('240V')">240V</button>
    <button id="voltage-120" onclick="setVoltage('120V')">120V</button>
  </div>
  <div id="process-section">
    <button id="tab-mig" onclick="setProcess('MIG')">MIG</button>
    <button id="tab-flux" onclick="setProcess('Flux-Cored')">Flux-Cored</button>
    <button id="tab-tig" onclick="setProcess('TIG')">TIG</button>
    <button id="tab-stick" onclick="setProcess('Stick')">Stick</button>
  </div>
  <div id="amperage-section">
    <input type="range" id="amperage-slider" oninput="setAmperage(this.value)">
    <span id="amperage-display">115A</span>
  </div>
  <svg viewBox="0 0 200 200">
    <circle id="gauge-bg" cx="100" cy="100" r="80" fill="none" stroke="#374151" stroke-width="12"/>
    <circle id="gauge-fill" cx="100" cy="100" r="80" fill="none" stroke="#f59e0b" stroke-width="12"
      stroke-dasharray="502.65" stroke-dashoffset="502.65" 
      stroke-linecap="round" transform="rotate(-90 100 100)"/>
    <text id="gauge-percent" x="100" y="95" text-anchor="middle" fill="white" font-size="32">100%</text>
    <text id="gauge-label" x="100" y="125" text-anchor="middle" fill="#9ca3af" font-size="12">DUTY CYCLE</text>
  </svg>
  <div id="cycle-text">Continuous use</div>
  <div id="warning-box" style="display:none">⚠️ High stress on welder. Rest frequently.</div>
</body>

USE THIS EXACT DATA for the duty cycles:
240V: MIG/Flux-Cored → 25% at 200A, 100% at 115A | TIG → 20% at 200A, 100% at 115A | Stick → 30% at 175A, 100% at 105A
120V: MIG/Flux-Cored → 20% at 140A, 100% at 90A | TIG → 20% at 140A, 100% at 90A | Stick → 40% at 125A, 100% at 90A

ALSO USE any additional data found here:
${context}

JAVASCRIPT FUNCTIONS REQUIRED — use these exact function names:
- setVoltage(v) — sets selectedVoltage, calls update()
- setProcess(p) — sets selectedProcess, calls update()  
- setAmperage(a) — sets selectedAmperage, calls update()
- update() — reads state, updates ALL elements by ID

In update():
- gauge-fill strokeDashoffset = 502.65 * (1 - dutyCycle/100)
- gauge-percent text = dutyCycle + '%'
- Color gauge-fill: green (#22c55e) if >60%, yellow (#eab308) if 30-60%, red (#ef4444) if <30%
- cycle-text = 'Weld Xmin → Rest Xmin per 10min' or 'Continuous use'
- warning-box display = block if duty < 30%, else none
- Active button highlighted with background #f59e0b, color #111827

window.onload = function() { update(); }

${baseRequirements}`,

    troubleshooting_flowchart: `Create an interactive troubleshooting decision tree for the Vulcan OmniPro 220.

REAL DATA FROM THE MANUAL:
${context}

EXACT HTML STRUCTURE TO USE — do not change any id attributes:

<body>
  <div id="screen-symptoms" class="screen">
    <h2>What problem are you experiencing?</h2>
    <div id="symptom-buttons"></div>
  </div>
  <div id="screen-question" class="screen" style="display:none">
    <div id="progress-text"></div>
    <h2 id="question-text"></h2>
    <button onclick="answerYes()">✓ Yes</button>
    <button onclick="answerNo()">✗ No</button>
    <button onclick="restart()">↩ Start Over</button>
  </div>
  <div id="screen-result" class="screen" style="display:none">
    <h2>Here's what to check:</h2>
    <div id="result-text"></div>
    <button onclick="restart()">↩ Start Over</button>
  </div>
</body>

JAVASCRIPT REQUIRED — use these exact function names:

const symptoms = [
  { name: "Porosity in welds", questions: [
    { q: "Are you using Flux-Cored wire?", yes: 1, no: 2 },
    { q: "Is polarity set to DCEN (electrode negative)?", yes: 2, no: "fix_polarity" },
    { q: "Is the base metal clean and free of rust/paint/oil?", yes: "fix_wire", no: "fix_metal" }
  ], fixes: {
    fix_polarity: "Change polarity to DCEN. On this welder, move the work clamp to (+) and gun to (-). Wrong polarity is the #1 cause of porosity in flux-cored welding.",
    fix_wire: "Check your wire: ensure it is dry, rust-free, and stored properly. Replace contaminated wire.",
    fix_metal: "Clean the base metal thoroughly. Grind or wire-brush to bare metal. Remove all rust, paint, mill scale, and oil within 1 inch of the weld area."
  }},
  { name: "Excessive spatter", questions: [
    { q: "Is voltage set too high?", yes: "fix_voltage", no: 1 },
    { q: "Is wire speed too fast?", yes: "fix_wirespeed", no: "fix_gas" }
  ], fixes: {
    fix_voltage: "Reduce voltage by 1-2 settings. High voltage causes erratic arc and spatter.",
    fix_wirespeed: "Reduce wire feed speed. Too fast causes stubbing and spatter.",
    fix_gas: "Check gas flow rate (15-25 CFH) and ensure no drafts are affecting the shield."
  }},
  { name: "No arc / won't start", questions: [
    { q: "Is the power switch ON and display showing?", yes: 1, no: "fix_power" },
    { q: "Is the work clamp connected to bare metal?", yes: "fix_settings", no: "fix_clamp" }
  ], fixes: {
    fix_power: "Check power switch, circuit breaker, and input voltage. Machine needs 120V or 240V supply.",
    fix_clamp: "Connect work clamp directly to bare metal workpiece. Remove paint or rust at clamp point.",
    fix_settings: "Check process selection and polarity settings match your wire type."
  }},
  { name: "Burn through", questions: [
    { q: "Are you welding thin material under 1/8 inch?", yes: "fix_thin", no: 1 },
    { q: "Is voltage too high for material thickness?", yes: "fix_voltage2", no: "fix_speed" }
  ], fixes: {
    fix_thin: "Use lower voltage setting and faster travel speed. Consider using 120V input for thin material.",
    fix_voltage2: "Reduce voltage 1-2 steps. For thin material use minimum settings.",
    fix_speed: "Increase travel speed and use weave pattern to distribute heat."
  }},
  { name: "Wire feed problems", questions: [
    { q: "Is wire feeding erratically or stopping?", yes: 1, no: "fix_tension" },
    { q: "Is drive roll tension set correctly?", yes: "fix_liner", no: "fix_tension" }
  ], fixes: {
    fix_tension: "Adjust drive roll tension — tighten if wire slips, loosen if wire crushes. Test by pressing wire against your finger.",
    fix_liner: "Check gun liner for kinks or blockage. Ensure correct wire size drive roll is installed.",
  }}
];

let currentSymptom = null;
let currentStep = 0;
let history = [];

function showSymptoms() {
  document.getElementById('screen-symptoms').style.display = 'block';
  document.getElementById('screen-question').style.display = 'none';
  document.getElementById('screen-result').style.display = 'none';
  const container = document.getElementById('symptom-buttons');
  container.innerHTML = '';
  symptoms.forEach((s, i) => {
    const btn = document.createElement('button');
    btn.textContent = s.name;
    btn.onclick = function() { selectSymptom(i); };
    container.appendChild(btn);
  });
}

function selectSymptom(index) {
  currentSymptom = index;
  currentStep = 0;
  history = [];
  showQuestion();
}

function showQuestion() {
  const symptom = symptoms[currentSymptom];
  const question = symptom.questions[currentStep];
  document.getElementById('screen-symptoms').style.display = 'none';
  document.getElementById('screen-question').style.display = 'block';
  document.getElementById('screen-result').style.display = 'none';
  document.getElementById('question-text').textContent = question.q;
  document.getElementById('progress-text').textContent = 'Step ' + (currentStep + 1) + ' of ' + symptom.questions.length;
}

function answerYes() {
  const question = symptoms[currentSymptom].questions[currentStep];
  history.push(currentStep);
  if (typeof question.yes === 'string') {
    showResult(question.yes);
  } else {
    currentStep = question.yes;
    showQuestion();
  }
}

function answerNo() {
  const question = symptoms[currentSymptom].questions[currentStep];
  history.push(currentStep);
  if (typeof question.no === 'string') {
    showResult(question.no);
  } else {
    currentStep = question.no;
    showQuestion();
  }
}

function showResult(fixKey) {
  const fix = symptoms[currentSymptom].fixes[fixKey];
  document.getElementById('screen-symptoms').style.display = 'none';
  document.getElementById('screen-question').style.display = 'none';
  document.getElementById('screen-result').style.display = 'block';
  document.getElementById('result-text').textContent = fix;
}

function restart() {
  currentSymptom = null;
  currentStep = 0;
  history = [];
  showSymptoms();
}

window.onload = function() { showSymptoms(); };

Style with dark theme: background #111827, cards #1f2937, accent #f59e0b.
Make buttons large and clickable. Smooth transitions between screens.
${baseRequirements}`,

    settings_configurator: `Create a welding settings configurator for the Vulcan OmniPro 220.

REAL DATA FROM THE MANUAL:
${context}

Extract every recommended setting, voltage, wire speed, gas type, and electrode mentioned above.

Build:
1. Step 1: Process selector — MIG | Flux-Cored | TIG | Stick
2. Step 2: Material selector — Mild Steel | Stainless | Aluminum
3. Step 3: Thickness slider — 1/16" to 3/8"
4. Output panel styled like the welder LCD showing:
   - Voltage setting
   - Wire speed (if applicable)
   - Gas type
   - Polarity (DCEP/DCEN)
   - Electrode type (if applicable)
5. All outputs update instantly when any input changes

CRITICAL: Use ONLY settings found in the manual data above. Show "Consult manual" if combination not found.
${baseRequirements}`,

    wiring_diagram: `Create an SVG wiring and polarity diagram for the Vulcan OmniPro 220.

REAL DATA FROM THE MANUAL:
${context}

Create a clean SVG schematic showing:
1. Rectangle representing the welder front panel (dark gray #1f2937)
2. Two clearly labeled circular sockets: "(-) Work" and "(+) Electrode"  
3. Colored cable lines coming from each socket
4. Labels for DCEP or DCEN per process
5. A legend showing which process uses which polarity
6. Amber (#f59e0b) accent colors, white labels, dark background (#111827)
7. viewBox="0 0 800 500" — no fixed width/height

Return ONLY the SVG code starting with <svg`,

    custom: `${context}
${baseRequirements}`,
  };

  const prompt = prompts[type] || prompts.custom;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/^```html\n?/, "").replace(/^```svg\n?/, "").replace(/\n?```$/, "").trim();

  // Detect if it's SVG
  const isSVG = cleaned.startsWith("<svg");
  const isMermaid = type === "mermaid_flowchart";

  return { html: cleaned, artifactType: isSVG ? "svg" : isMermaid ? "mermaid" : "html" };
}

export async function POST(req: Request) {
  const { messages, image, imageType } = await req.json();

  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const send = (data: object) => {
    writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  };

  (async () => {
    try {
      const agentMessages: Anthropic.MessageParam[] = messages.map(
  (m: { role: string; content: string }, index: number) => {
    // Attach image to the last user message
    if (
      m.role === "user" &&
      index === messages.length - 1 &&
      image
    ) {
      return {
        role: "user" as const,
        content: [
          {
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: (imageType || "image/jpeg") as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
              data: image,
            },
          },
          {
            type: "text" as const,
            text: m.content || "What do you see in this image? How does it relate to welding with the Vulcan OmniPro 220?",
          },
        ],
      };
    }
    return {
      role: m.role as "user" | "assistant",
      content: m.content,
    };
  }
);

      // Agentic loop — keeps going until no more tool calls
      while (true) {
        const response = await client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          tools,
          messages: agentMessages,
        });

        // No tool calls — final response, stream text and stop
        if (response.stop_reason !== "tool_use") {
          for (const block of response.content) {
            if (block.type === "text" && block.text) {
              send({ type: "text", content: block.text });
            }
          }
          break;
        }

        // Process tool calls
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type !== "tool_use") continue;

          const input = block.input as Record<string, string | number>;
          send({ type: "tool_start", tool: block.name });

          let resultContent = "";

          if (block.name === "search_manual") {
            const results = searchByKeyword(input.query as string, 4);
            resultContent = results
              .map(
                (r) =>
                  `[Page ${r.page} - ${r.source}]\n${r.text}\nImage: ${r.image_path}`
              )
              .join("\n\n---\n\n");

            send({
              type: "tool_done",
              tool: "search_manual",
              preview: `Found ${results.length} relevant pages`,
            });
          } else if (block.name === "get_section") {
            const pages = getSectionPages(input.section as string);
            resultContent = pages
              .map(
                (r) =>
                  `[Page ${r.page} - ${r.source}]\n${r.text}\nImage: ${r.image_path}`
              )
              .join("\n\n---\n\n");

            send({
              type: "tool_done",
              tool: "get_section",
              preview: `Retrieved ${pages.length} pages from ${input.section}`,
            });
          } else if (block.name === "get_page_image") {
            const source = input.source as string;
            const pageNum = input.page_number as number;
            const imgFilename = `${source}_page_${String(pageNum).padStart(3, "0")}.png`;
            const imgPath = `knowledge/images/${imgFilename}`;

            try {
              const base64 = getPageImageBase64(imgPath);
              send({
                type: "image",
                src: `data:image/png;base64,${base64}`,
                caption: input.caption as string,
              });
              resultContent = `Image displayed to user: ${input.caption}`;
            } catch {
              resultContent = `Image not found: ${imgPath}`;
            }
          } else if (block.name === "generate_artifact") {
            send({
              type: "tool_done",
              tool: "generate_artifact",
              preview: `Building ${input.type}...`,
            });

            const result = await generateArtifactHTML(
              input.type as string,
              input.title as string,
              input.context as string
            );

            send({
              type: "artifact",
              html: result.html,
              title: input.title as string,
              artifactType: result.artifactType,
            });

            resultContent = `Interactive artifact "${input.title}" displayed to user.`;
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: resultContent,
          });
        }

        // Continue loop
        agentMessages.push({ role: "assistant", content: response.content });
        agentMessages.push({ role: "user", content: toolResults });
      }

      send({ type: "done" });
    } catch (err) {
      console.error(err);
      send({ type: "error", message: String(err) });
    } finally {
      writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}