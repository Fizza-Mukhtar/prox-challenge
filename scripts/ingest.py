import fitz  # PyMuPDF
import json
import os
from pathlib import Path

# ── Config ──────────────────────────────────────────
PDFS = {
    "owner_manual": "files/owner-manual.pdf",
    "quick_start":  "files/quick-start-guide.pdf",
    "selection_chart": "files/selection-chart.pdf",
}
OUTPUT_DIR   = Path("knowledge")
IMAGES_DIR   = OUTPUT_DIR / "images"
IMAGES_DIR.mkdir(parents=True, exist_ok=True)

all_chunks = []

for doc_name, pdf_path in PDFS.items():
    print(f"\n📄 Processing {pdf_path}...")
    doc = fitz.open(pdf_path)

    for page_num in range(len(doc)):
        page = doc[page_num]

        # 1. Save full page as high-res image
        mat  = fitz.Matrix(2.0, 2.0)          # 2× zoom = readable
        pix  = page.get_pixmap(matrix=mat)
        img_filename = f"{doc_name}_page_{page_num+1:03d}.png"
        img_path = IMAGES_DIR / img_filename
        pix.save(str(img_path))

        # 2. Extract text
        raw_text = page.get_text().strip()

        chunk = {
            "id":           f"{doc_name}_page_{page_num+1}",
            "source":       doc_name,
            "page":         page_num + 1,
            "text":         raw_text,
            "image_path":   str(img_path),
            "has_images":   len(page.get_images()) > 0,
            "char_count":   len(raw_text),
        }
        all_chunks.append(chunk)

        print(f"  ✓ Page {page_num+1:3d} — {len(raw_text):5d} chars  {'[has images]' if chunk['has_images'] else ''}")

    doc.close()

# 3. Save all chunks to JSON
out_path = OUTPUT_DIR / "chunks.json"
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(all_chunks, f, indent=2, ensure_ascii=False)

print(f"\n✅ Done! {len(all_chunks)} pages extracted → {out_path}")
print(f"🖼️  Images saved to → {IMAGES_DIR}")