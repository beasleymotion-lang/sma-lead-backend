#!/usr/bin/env python3
from pathlib import Path
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
GUIDES = ["sma-buyers-guide.pdf", "sma-sellers-playbook.pdf", "sma-moving-guide.pdf"]
for name in GUIDES:
    path = ROOT / "public" / "guides" / name
    assert path.exists() and path.stat().st_size > 5_000, f"missing or implausibly small: {path}"
    reader = PdfReader(path)
    assert len(reader.pages) == 4, f"unexpected page count in {name}"
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    assert "BLAZE BEASLEY" in text.upper() and "PRIVATE" in text.upper(), f"required content missing: {name}"
    assert reader.metadata.title, f"missing title metadata: {name}"
    links = []
    for page in reader.pages:
        for a in page.get("/Annots", []):
            obj = a.get_object()
            if obj.get("/A") and obj["/A"].get("/URI"): links.append(str(obj["/A"]["/URI"]))
    assert any("withbeasley.com/#contact" in u for u in links), f"CTA link missing: {name}"
    print(f"OK {name}: {len(reader.pages)} pages, {path.stat().st_size} bytes")
