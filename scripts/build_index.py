import json
import base64
from pathlib import Path

KNOWLEDGE_DIR = Path("knowledge")
CHUNKS_FILE   = KNOWLEDGE_DIR / "chunks.json"
IMAGES_DIR    = KNOWLEDGE_DIR / "images"
INDEX_FILE    = KNOWLEDGE_DIR / "section_index.json"

print("📚 Building image index...")

# Load chunks
with open(CHUNKS_FILE, "r", encoding="utf-8") as f:
    chunks = json.load(f)

# Build a lookup: source+page → image_path + text
page_lookup = {}
for chunk in chunks:
    key = f"{chunk['source']}_page_{chunk['page']}"
    page_lookup[key] = {
        "id":         chunk["id"],
        "source":     chunk["source"],
        "page":       chunk["page"],
        "text":       chunk["text"],
        "image_path": chunk["image_path"],
    }

# Load section index
with open(INDEX_FILE, "r") as f:
    sections = json.load(f)

# Build enriched section index with image paths resolved
enriched = {}
for section_name, section_data in sections.items():
    pages_info = []
    for page_num in section_data["pages"]:
        source = section_data["source"]
        key = f"{source}_page_{page_num}"
        if key in page_lookup:
            pages_info.append(page_lookup[key])
        else:
            print(f"  ⚠️  Missing: {key}")
    
    enriched[section_name] = {
        **section_data,
        "pages_data": pages_info
    }
    print(f"  ✓ {section_name}: {len(pages_info)} pages indexed")

# Save enriched index
out_path = KNOWLEDGE_DIR / "enriched_index.json"
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(enriched, f, indent=2)

# Also save full text index for keyword search
text_index = []
for chunk in chunks:
    if chunk["text"].strip():
        text_index.append({
            "id":         chunk["id"],
            "source":     chunk["source"],
            "page":       chunk["page"],
            "text":       chunk["text"],
            "image_path": chunk["image_path"],
        })

text_path = KNOWLEDGE_DIR / "text_index.json"
with open(text_path, "w", encoding="utf-8") as f:
    json.dump(text_index, f, indent=2)

print(f"\n✅ Done!")
print(f"  enriched_index.json → {len(enriched)} sections")
print(f"  text_index.json     → {len(text_index)} pages")

# Sanity check — verify key images exist
print("\n🧪 Verifying key images exist...")
key_checks = [
    ("duty_cycle",       "owner_manual", 19),
    ("polarity_wiring",  "owner_manual", 45),
    ("front_panel",      "owner_manual",  8),
    ("troubleshooting",  "owner_manual", 42),
    ("process_selection","selection_chart", 1),
]
for section, source, page in key_checks:
    img = IMAGES_DIR / f"{source}_page_{page:03d}.png"
    status = "✅" if img.exists() else "❌ MISSING"
    print(f"  {status} {section} → {img.name}")