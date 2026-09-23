"""Apple: chunk docs / skill cards into the worker's RAG format (packages/corpus/data/chunks.jsonl).

Input JSON: {"prefix": "skill", "docs": [{"path": "/abs/card.md"} | {"text": "...", "title": "...", "url": "..."}]}
Output: JSONL, one chunk per line: {vecId, docSlug, title, url, kind: "guide", text, embed: true}
Same packing as packages/corpus/src/chunk.mjs (split on "## ", paragraphs and whole code fences,
target 1200 chars, min 600, hard max 2600, breadcrumb first line), so a chunk made here reads like
every other guide chunk and packages/corpus/src/upload.mjs can index it. No model, no network.
"""

import hashlib
import json
import re
from pathlib import Path

from lfx.custom.custom_component.component import Component
from lfx.io import MessageTextInput, Output
from lfx.schema.message import Message

GUIDE_MIN, GUIDE_TARGET, GUIDE_HARD_MAX = 600, 1200, 2600
MAX_DOCS, MAX_DOC_CHARS = 200, 2_000_000
FENCE = re.compile(r"^\s*(```|~~~)")


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def split_h2(body: str):
    sections, heading, cur, in_fence = [], "", [], False
    for line in body.split("\n"):
        if FENCE.match(line):
            in_fence = not in_fence
        h = None if in_fence else re.match(r"^##\s+(.+?)\s*$", line)
        if h:
            if "\n".join(cur).strip():
                sections.append((heading, "\n".join(cur).strip()))
            heading, cur = re.sub(r"[#*`]", "", h[1]).strip(), []
            continue
        cur.append(line)
    if "\n".join(cur).strip():
        sections.append((heading, "\n".join(cur).strip()))
    return sections or [("", "")]


def blocks(text: str):
    out, cur, in_fence = [], [], False
    for line in text.split("\n"):
        if FENCE.match(line):
            if not in_fence and cur:
                out.append("\n".join(cur).strip())
                cur = []
            cur.append(line)
            if in_fence:
                out.append("\n".join(cur).strip())
                cur = []
            in_fence = not in_fence
        elif in_fence:
            cur.append(line)
        elif not line.strip():
            if cur:
                out.append("\n".join(cur).strip())
            cur = []
        else:
            cur.append(line)
    if cur:
        out.append("\n".join(cur).strip())
    return [b for b in out if b]


def pack(sections, page_title: str):
    chunks, cur = [], None
    for heading, body in sections:
        crumb = f"{page_title} > {heading}" if heading else page_title
        for b in blocks(body):
            limit = GUIDE_HARD_MAX if len(b) > GUIDE_TARGET else GUIDE_TARGET
            if cur and len(cur["text"]) + len(b) + 2 > limit and len(cur["text"]) >= GUIDE_MIN:
                chunks.append(cur)
                cur = None
            if cur is None:
                cur = {"title": f"{page_title} — {heading}" if heading else page_title, "text": f"{crumb}\n\n"}
            elif heading and not cur["text"].startswith(crumb) and f"\n## {heading}" not in cur["text"]:
                cur["text"] += f"\n## {heading}\n"
            cur["text"] += b[: GUIDE_HARD_MAX * 2] + "\n\n"
            if len(cur["text"]) >= GUIDE_TARGET:
                chunks.append(cur)
                cur = None
    if cur and cur["text"].strip():
        chunks.append(cur)
    if len(chunks) >= 2 and len(chunks[-1]["text"]) < 300:
        last = chunks.pop()
        chunks[-1]["text"] += "\n" + last["text"]
    return [{**c, "text": re.sub(r"\n{3,}", "\n\n", c["text"]).strip()} for c in chunks]


def chunk_doc(doc: dict, prefix: str) -> list:
    text, title, url = doc.get("text"), doc.get("title"), doc.get("url")
    if doc.get("path"):
        p = Path(doc["path"]).expanduser()
        text = p.read_text(encoding="utf-8")
        url = url or f"repo://{p.name}"
    if not text or not text.strip():
        raise ValueError(f"empty document: {doc.get('path') or title}")
    text = text[:MAX_DOC_CHARS]
    text = re.sub(r"^---\r?\n[\s\S]*?\r?\n---\r?\n?", "", text)  # frontmatter
    h1 = re.search(r"^#\s+(.+?)\s*$", text, re.M)
    title = title or (h1[1].strip() if h1 else (url or "untitled"))
    if h1:
        text = text.replace(h1[0], "", 1)
    url = url or f"doc://{slugify(title)}"
    doc_slug = (doc.get("docSlug") or f"{prefix}-{slugify(title)}")[:96]
    id_base = hashlib.sha1(f"{prefix}/{url}".encode()).hexdigest()[:8]
    return [
        {"vecId": f"g-{id_base}-{i + 1}", "docSlug": doc_slug, "title": c["title"], "url": url,
         "kind": "guide", "text": c["text"], "embed": True}
        for i, c in enumerate(pack(split_h2(text), title))
    ]


def parse_spec(text: str) -> dict:
    """JSON, or (typed in the Playground) one file path per line, or the document text itself."""
    try:
        spec = json.loads(text)
        if isinstance(spec, dict):
            return spec
    except ValueError:
        pass
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if lines and all(Path(ln).expanduser().is_file() for ln in lines):
        return {"docs": [{"path": ln} for ln in lines]}
    return {"docs": [{"text": text}]}


def chunk_all(spec: dict) -> list:
    docs = spec.get("docs") or []
    if not docs:
        raise ValueError("no docs to chunk")
    if len(docs) > MAX_DOCS:
        raise ValueError(f"{len(docs)} docs; the cap per run is {MAX_DOCS}")
    prefix = slugify(spec.get("prefix", "apple")) or "apple"
    out = []
    for d in docs:
        out.extend(chunk_doc(d, prefix))
    return out


class AppleRagChunker(Component):
    display_name = "Apple: RAG chunker"
    description = "Docs and skill cards -> chunks.jsonl lines in the worker's index format."
    icon = "scissors"
    name = "AppleRagChunker"

    inputs = [MessageTextInput(name="spec", display_name="Docs JSON", required=True)]
    outputs = [Output(display_name="Chunks JSONL", name="chunks", method="build")]

    def build(self) -> Message:
        chunks = chunk_all(parse_spec(self.spec))
        self.status = f"{len(chunks)} chunks"
        return Message(text="\n".join(json.dumps(c, ensure_ascii=False) for c in chunks))
