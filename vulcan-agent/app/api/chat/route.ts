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
- Single self-contained HTML file
- All CSS and JS inline, no external dependencies
- Every button/tab/slider must have working JavaScript event listeners
- All values must update instantly on interaction
- Dark theme: background #111827, cards #1f2937, accent #f59e0b, white text
- Mobile responsive
- Return ONLY the HTML starting with <!DOCTYPE html>`;

  const prompts: Record<string, string> = {
    duty_cycle_calculator: `Create a fully interactive duty cycle calculator for the Vulcan OmniPro 220.

REAL DATA FROM THE MANUAL — use these exact numbers:
${context}

Extract every duty cycle percentage, amperage, and voltage value from the data above.

Build:
1. Voltage toggle buttons: 120V / 240V
2. Process tabs: MIG | Flux-Cored | TIG | Stick  
3. Amperage slider that updates based on selected process/voltage
4. Large circular SVG gauge showing duty cycle % — updates on every interaction
5. "Weld X.X min → Rest X.X min per 10 min cycle" text — updates live
6. Color coding: green >60%, yellow 30-60%, red <30%
7. Red warning box when duty cycle is under 30%

CRITICAL: Use ONLY numbers found in the manual data above. If a combination has no data, show "See manual for this setting".
${baseRequirements}`,

    troubleshooting_flowchart: `Create an interactive troubleshooting decision tree for the Vulcan OmniPro 220.

REAL DATA FROM THE MANUAL:
${context}

Extract every problem, cause, and fix mentioned in the data above.

Build:
1. Symptom selection screen — buttons for each problem found in the data (porosity, spatter, no arc, burn through, wire feed issues, machine won't start, etc.)
2. Clicking a symptom starts a Yes/No decision tree based on manual causes
3. Each final node shows the exact fix from the manual
4. "Start Over" button always visible
5. Progress indicator showing current step
6. Smooth transitions between steps

CRITICAL: Use ONLY problems and fixes found in the manual data above.
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