import json
from pathlib import Path
from uuid import uuid4
import pandas as pd
import fitz
from app.config import settings
from app.utils.text_utils import clean_text


def _is_table_block(text: str) -> bool:
    if "|" in text and text.count("|") >= 4:
        return True
    if "\t" in text and text.count("\t") >= 2:
        return True
    lines = [line for line in text.splitlines() if line.strip()]
    if len(lines) >= 2:
        multi_space_lines = sum(1 for line in lines if "  " in line)
        if multi_space_lines >= 2:
            return True
    return False


def parse_pdf(file_path: str) -> list[dict]:
    blocks = []
    doc = fitz.open(file_path)
    for page_idx in range(len(doc)):
        page = doc[page_idx]
        for block in page.get_text("blocks"):
            if len(block) < 5:
                continue
            text = block[4]
            if not text or not text.strip():
                continue
            block_type = "table" if _is_table_block(text) else "text"
            blocks.append(
                {
                    "text": clean_text(text),
                    "page_num": page_idx + 1,
                    "block_type": block_type,
                    "source_file": Path(file_path).name,
                }
            )
    return blocks


def parse_csv(file_path: str) -> list[dict]:
    blocks = []
    df = pd.read_csv(file_path)
    headers = " | ".join([str(c) for c in df.columns])
    chunk_size = 50
    for i in range(0, len(df), chunk_size):
        chunk = df.iloc[i : i + chunk_size]
        rows = []
        for _, row in chunk.iterrows():
            rows.append(" | ".join([str(v) for v in row.values]))
        text = headers + "\n" + "\n".join(rows)
        blocks.append(
            {
                "text": clean_text(text),
                "page_num": (i // chunk_size) + 1,
                "block_type": "table",
                "source_file": Path(file_path).name,
            }
        )
    return blocks


def parse_xlsx(file_path: str) -> list[dict]:
    blocks = []
    excel = pd.ExcelFile(file_path)
    for sheet_name in excel.sheet_names:
        df = excel.parse(sheet_name)
        headers = " | ".join([str(c) for c in df.columns])
        chunk_size = 50
        for i in range(0, len(df), chunk_size):
            chunk = df.iloc[i : i + chunk_size]
            rows = []
            for _, row in chunk.iterrows():
                rows.append(" | ".join([str(v) for v in row.values]))
            text = f"Sheet: {sheet_name}\n" + headers + "\n" + "\n".join(rows)
            blocks.append(
                {
                    "text": clean_text(text),
                    "page_num": (i // chunk_size) + 1,
                    "block_type": "table",
                    "source_file": Path(file_path).name,
                }
            )
    return blocks


def parse_json(file_path: str) -> list[dict]:
    blocks = []
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    source = Path(file_path).name

    if isinstance(data, list):
        chunk_size = 20
        for i in range(0, len(data), chunk_size):
            chunk = data[i : i + chunk_size]
            text = json.dumps(chunk, indent=2, ensure_ascii=False)
            blocks.append(
                {
                    "text": clean_text(text),
                    "page_num": (i // chunk_size) + 1,
                    "block_type": "text",
                    "source_file": source,
                }
            )
    elif isinstance(data, dict):
        for idx, (key, value) in enumerate(data.items(), start=1):
            text = f"{key}:\n" + json.dumps(value, indent=2, ensure_ascii=False)
            blocks.append(
                {
                    "text": clean_text(text),
                    "page_num": idx,
                    "block_type": "text",
                    "source_file": source,
                }
            )
    else:
        blocks.append(
            {
                "text": clean_text(str(data)),
                "page_num": 1,
                "block_type": "text",
                "source_file": source,
            }
        )

    return blocks


def parse_txt(file_path: str) -> list[dict]:
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
    blocks = []
    buffer = ""
    page_num = 1
    for para in paragraphs:
        if len(buffer) + len(para) + 1 <= settings.chunk_size:
            buffer = (buffer + "\n" + para).strip()
        else:
            if buffer:
                blocks.append(
                    {
                        "text": clean_text(buffer),
                        "page_num": page_num,
                        "block_type": "text",
                        "source_file": Path(file_path).name,
                    }
                )
                page_num += 1
            buffer = para
    if buffer:
        blocks.append(
            {
                "text": clean_text(buffer),
                "page_num": page_num,
                "block_type": "text",
                "source_file": Path(file_path).name,
            }
        )
    return blocks


def chunk_document(blocks: list[dict], chunk_size: int, chunk_overlap: int, file_id: str) -> list[dict]:
    chunks = []
    chunk_index = 0
    step = max(1, chunk_size - chunk_overlap)

    for block in blocks:
        text = clean_text(block.get("text", ""))
        if not text:
            continue
        if block.get("block_type") == "table":
            chunk_id = str(uuid4())
            chunks.append(
                {
                    "chunk_id": chunk_id,
                    "text": text,
                    "metadata": {
                        "source_file": block.get("source_file"),
                        "file_id": file_id,
                        "page_num": block.get("page_num"),
                        "block_type": "table",
                        "chunk_index": chunk_index,
                        "char_count": len(text),
                    },
                }
            )
            chunk_index += 1
            continue

        for start in range(0, len(text), step):
            chunk_text = text[start : start + chunk_size]
            if not chunk_text:
                continue
            chunk_id = str(uuid4())
            chunks.append(
                {
                    "chunk_id": chunk_id,
                    "text": chunk_text,
                    "metadata": {
                        "source_file": block.get("source_file"),
                        "file_id": file_id,
                        "page_num": block.get("page_num"),
                        "block_type": "text",
                        "chunk_index": chunk_index,
                        "char_count": len(chunk_text),
                    },
                }
            )
            chunk_index += 1
    return chunks


def ingest_file(file_path: str, file_id: str, filename: str) -> dict:
    path = Path(file_path)
    ext = path.suffix.lower()

    if ext == ".pdf":
        blocks = parse_pdf(file_path)
    elif ext == ".csv":
        blocks = parse_csv(file_path)
    elif ext in {".xlsx", ".xls"}:
        blocks = parse_xlsx(file_path)
    elif ext == ".json":
        blocks = parse_json(file_path)
    elif ext in {".txt", ".md"}:
        blocks = parse_txt(file_path)
    else:
        blocks = []

    chunks = chunk_document(blocks, settings.chunk_size, settings.chunk_overlap, file_id)

    return {
        "file_id": file_id,
        "filename": filename,
        "chunks": chunks,
        "chunk_count": len(chunks),
    }
