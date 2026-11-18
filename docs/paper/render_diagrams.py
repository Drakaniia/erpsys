"""Render the Mermaid blocks in FINAL_PAPER.md to the PNGs in diagrams/.

Blocks are matched to file names by order (Figure 3.1 ... 3.9). Uses `mmdc`
from PATH, or falls back to `npx -p @mermaid-js/mermaid-cli mmdc` (no install
into any package.json). Run paper2docx.py afterwards to rebuild the docx.

Usage: python docs/paper/render_diagrams.py [index ...]
       e.g. `python docs/paper/render_diagrams.py 3 6` renders only 3.4 and 3.7
"""
import json
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

root = pathlib.Path(__file__).resolve().parent
out_dir = root / "diagrams"

NAMES = [
    "3-1-activity-submit",
    "3-2-activity-review",
    "3-3-activity-queue",
    "3-4-activity-serving",
    "3-5-activity-year",
    "3-6-user-flow",
    "3-7-use-case",
    "3-8-gantt",
    "3-9-deployment",
]

CONFIG = {
    "theme": "base",
    "themeVariables": {
        "fontFamily": "Arial, Helvetica, sans-serif",
        "fontSize": "16px",
        "primaryColor": "#ffffff",
        "primaryBorderColor": "#1f2937",
        "primaryTextColor": "#111827",
        "lineColor": "#374151",
        "clusterBkg": "#f3f4f6",
        "clusterBorder": "#9ca3af",
        "edgeLabelBackground": "#ffffff",
    },
    "flowchart": {
        "htmlLabels": True,
        "curve": "basis",
        "nodeSpacing": 24,
        "rankSpacing": 30,
        "padding": 6,
        "diagramPadding": 8,
        "useMaxWidth": False,
        "wrappingWidth": 320,
    },
    "gantt": {"fontSize": 14, "barHeight": 24, "sectionFontSize": 14, "leftPadding": 260},
}


def mmdc_cmd():
    exe = shutil.which("mmdc")
    if exe:
        return [exe]
    npx = shutil.which("npx")
    if not npx:
        sys.exit("mmdc not found: install Node.js, or `npm i -g @mermaid-js/mermaid-cli`")
    return [npx, "-y", "-p", "@mermaid-js/mermaid-cli", "mmdc"]


src = (root / "FINAL_PAPER.md").read_text(encoding="utf-8")
blocks = re.findall(r"```mermaid\r?\n(.*?)\r?\n```", src, flags=re.S)
if len(blocks) != len(NAMES):
    sys.exit(f"mermaid blocks ({len(blocks)}) != expected diagrams ({len(NAMES)})")

only = {int(a) for a in sys.argv[1:]}
cmd = mmdc_cmd()
failed = 0
with tempfile.TemporaryDirectory() as tmp:
    tmp = pathlib.Path(tmp)
    cfg = tmp / "config.json"
    cfg.write_text(json.dumps(CONFIG), encoding="utf-8")
    for i, (name, body) in enumerate(zip(NAMES, blocks)):
        if only and i not in only:
            continue
        mmd = tmp / f"{name}.mmd"
        mmd.write_text(body.replace("\r\n", "\n"), encoding="utf-8")
        r = subprocess.run(
            [*cmd, "-i", str(mmd), "-o", str(out_dir / f"{name}.png"),
             "-c", str(cfg), "-b", "white", "-s", "2", "-q"],
            capture_output=True, text=True, shell=sys.platform == "win32")
        ok = r.returncode == 0
        failed += not ok
        print(f"{name}: {'ok' if ok else 'FAIL'}", "" if ok else r.stderr.strip()[-400:])

sys.exit(1 if failed else 0)
