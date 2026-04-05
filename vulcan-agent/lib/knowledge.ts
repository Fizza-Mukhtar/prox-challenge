import fs from "fs";
import path from "path";

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge");

export interface PageData {
  id: string;
  source: string;
  page: number;
  text: string;
  image_path: string;
}

export interface Section {
  pages: number[];
  source: string;
  description: string;
  pages_data: PageData[];
}

// Load enriched index once at startup
let _index: Record<string, Section> | null = null;
function getIndex(): Record<string, Section> {
  if (!_index) {
    const raw = fs.readFileSync(
      path.join(KNOWLEDGE_DIR, "enriched_index.json"),
      "utf-8"
    );
    _index = JSON.parse(raw);
  }
  return _index!;
}

// Load text index once at startup
let _textIndex: PageData[] | null = null;
function getTextIndex(): PageData[] {
  if (!_textIndex) {
    const raw = fs.readFileSync(
      path.join(KNOWLEDGE_DIR, "text_index.json"),
      "utf-8"
    );
    _textIndex = JSON.parse(raw);
  }
  return _textIndex!;
}

// Keyword search across all pages
export function searchByKeyword(query: string, topK = 5): PageData[] {
  const index = getTextIndex();
  const terms = query.toLowerCase().split(/\s+/);

  const scored = index.map((page) => {
    const text = page.text.toLowerCase();
    const score = terms.reduce((acc, term) => {
      const count = (text.match(new RegExp(term, "g")) || []).length;
      return acc + count;
    }, 0);
    return { ...page, score };
  });

  return scored
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// Get pages for a specific section
export function getSectionPages(sectionName: string): PageData[] {
  const index = getIndex();
  const section = index[sectionName];
  if (!section) return [];
  return section.pages_data;
}

// Get image as base64
export function getPageImageBase64(imagePath: string): string {
  // imagePath is relative like "knowledge/images/owner_manual_page_019.png"
  // resolve from project root
  const fullPath = path.join(process.cwd(), imagePath);
  const buffer = fs.readFileSync(fullPath);
  return buffer.toString("base64");
}

// Get all section names and descriptions (for the agent to know what's available)
export function getSectionSummary(): string {
  const index = getIndex();
  return Object.entries(index)
    .map(([name, s]) => `- ${name}: ${s.description}`)
    .join("\n");
}