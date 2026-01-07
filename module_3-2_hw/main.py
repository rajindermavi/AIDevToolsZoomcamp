
import re
from pathlib import Path

import requests
from fastmcp import FastMCP

mcp = FastMCP("Demo")

@mcp.tool
def add(a: int, b: int) -> int:
    """Add two numbers"""
    return a + b

OUTPUT_DIR = Path(__file__).resolve().parent / "md_outputs"


def _safe_filename(website: str) -> str:
    normalized = website.strip().rstrip("/") or "output"
    normalized = normalized.replace("://", "_")
    normalized = re.sub(r"[^A-Za-z0-9._-]+", "_", normalized)
    return normalized[:120] or "output"


@mcp.tool
def fetch_markdown_to_file(website: str) -> dict:
    """Fetch markdown via r.jina.ai, save to md_outputs, return path and char count."""
    if not website or not website.strip():
        raise ValueError("website must be a non-empty string")

    target = website.strip().lstrip("/")
    url = f"https://r.jina.ai/{target}"
    response = requests.get(url, timeout=20)
    response.raise_for_status()

    content = response.text
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / f"{_safe_filename(website)}.md"
    output_path.write_text(content, encoding="utf-8")

    return {"file_path": str(output_path), "character_count": len(content)}


def main():
    mcp.run()


if __name__ == "__main__":
    main()
