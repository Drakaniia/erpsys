"""Build the separate paper and API Word documents using python-docx.

Usage: python docs/paper/paper2docx.py
Run render_diagrams.py first after changing Mermaid diagrams.
"""
import pathlib
import re

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt
from markdown_it import MarkdownIt
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent
PARSER = MarkdownIt("commonmark").enable("table")
DIAGRAMS = sorted((ROOT / "diagrams").glob("3-*.png"))


def add_link(paragraph, text, target):
    link = OxmlElement("w:hyperlink")
    link.set(qn("r:id"), paragraph.part.relate_to(
        target, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", is_external=True))
    run = OxmlElement("w:r")
    props = OxmlElement("w:rPr")
    color = OxmlElement("w:color")
    color.set(qn("w:val"), "0563C1")
    props.append(color)
    run.append(props)
    node = OxmlElement("w:t")
    node.text = text
    run.append(node)
    link.append(run)
    paragraph._p.append(link)


def add_picture(paragraph, path):
    with Image.open(path) as image:
        width, height = image.size
    inches = min(6.5, 8.2 * width / height, width / 160)
    paragraph.add_run().add_picture(str(path), width=Inches(inches))
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER


def inline(paragraph, token):
    bold = italic = False
    children = token.children or []
    i = 0
    while i < len(children):
        child = children[i]
        if child.type in ("strong_open", "strong_close"):
            bold = child.type == "strong_open"
        elif child.type in ("em_open", "em_close"):
            italic = child.type == "em_open"
        elif child.type == "link_open":
            target = child.attrGet("href")
            label = []
            i += 1
            while i < len(children) and children[i].type != "link_close":
                label.append(children[i].content)
                i += 1
            add_link(paragraph, "".join(label), target)
        elif child.type == "image":
            path = ROOT / child.attrGet("src")
            if not path.is_file():
                raise FileNotFoundError(path)
            add_picture(paragraph, path)
        elif child.type in ("softbreak", "hardbreak"):
            paragraph.add_run().add_break()
        elif child.type in ("text", "code_inline"):
            run = paragraph.add_run(child.content)
            run.bold, run.italic = bold, italic
            if child.type == "code_inline":
                run.font.name = "Consolas"
                run.font.size = Pt(9)
        i += 1


def field(paragraph, instruction, placeholder=""):
    run = paragraph.add_run()
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    code = OxmlElement("w:instrText")
    code.set(qn("xml:space"), "preserve")
    code.text = instruction
    separate = OxmlElement("w:fldChar")
    separate.set(qn("w:fldCharType"), "separate")
    text = OxmlElement("w:t")
    text.text = placeholder
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    for item in (begin, code, separate, text, end):
        run._r.append(item)


def build(name):
    source = (ROOT / f"{name}.md").read_text(encoding="utf-8")
    doc = Document()
    section = doc.sections[0]
    section.page_width, section.page_height = Inches(8.5), Inches(11)
    section.top_margin = section.bottom_margin = Inches(0.8)
    section.left_margin = section.right_margin = Inches(1)
    normal = doc.styles["Normal"]
    normal.font.name = "Times New Roman"
    normal.font.size = Pt(11)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.15
    for level, size in ((1, 16), (2, 14), (3, 12)):
        style = doc.styles[f"Heading {level}"]
        style.font.name = "Times New Roman"
        style.font.size = Pt(size)
        style.font.color.rgb = None
        style.paragraph_format.keep_with_next = True
    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    field(footer, " PAGE ")
    doc.core_properties.title = "ERPSYS — Chapters 1–5" if name == "FINAL_PAPER" else "ERPSYS — API Documentation"
    doc.core_properties.subject = "Enrollment Records and Processing System"
    tokens = PARSER.parse(source)
    i = diagram = 0
    lists = []
    while i < len(tokens):
        token = tokens[i]
        if token.type == "heading_open":
            label = tokens[i + 1].content
            level = int(token.tag[1:])
            if i == 0:
                paragraph = doc.add_paragraph(style="Title")
                inline(paragraph, tokens[i + 1])
                if name == "API_DOCUMENTATION":
                    doc.add_heading("Table of Contents", level=1)
                    field(doc.add_paragraph(), ' TOC \\o "1-3" \\h \\z \\u ', "Update fields in Word to populate contents.")
            elif label == "Table of Contents":
                doc.add_heading(label, level=1)
                field(doc.add_paragraph(), ' TOC \\o "1-3" \\h \\z \\u ', "Update fields in Word to populate contents.")
            else:
                paragraph = doc.add_heading(level=level)
                if level == 1:
                    paragraph.paragraph_format.page_break_before = True
                inline(paragraph, tokens[i + 1])
            i += 2
        elif token.type == "table_open":
            rows = []
            row = None
            header = True
            while tokens[i].type != "table_close":
                entry = tokens[i]
                if entry.type == "tr_open":
                    row = []
                    rows.append(row)
                elif entry.type == "inline" and row is not None:
                    row.append(entry)
                i += 1
            table = doc.add_table(rows=0, cols=len(rows[0]))
            table.style = "Table Grid"
            table.alignment = WD_TABLE_ALIGNMENT.CENTER
            table.autofit = False
            width = 6.5 / len(rows[0])
            for column in table.columns:
                column.width = Inches(width)
            for row_index, cells in enumerate(rows):
                result = table.add_row()
                for cell, value in zip(result.cells, cells):
                    cell.width = Inches(width)
                    inline(cell.paragraphs[0], value)
                    for run in cell.paragraphs[0].runs:
                        run.font.size = Pt(9)
                        if row_index == 0:
                            run.bold = True
                if row_index == 0:
                    repeat = OxmlElement("w:tblHeader")
                    result._tr.get_or_add_trPr().append(repeat)
                cannot_split = OxmlElement("w:cantSplit")
                result._tr.get_or_add_trPr().append(cannot_split)
            doc.add_paragraph().paragraph_format.space_after = Pt(0)
        elif token.type in ("bullet_list_open", "ordered_list_open"):
            lists.append("List Bullet" if token.type == "bullet_list_open" else "List Number")
        elif token.type in ("bullet_list_close", "ordered_list_close"):
            lists.pop()
        elif token.type == "paragraph_open":
            paragraph = doc.add_paragraph(style=lists[-1] if lists else None)
            inline(paragraph, tokens[i + 1])
            i += 2
        elif token.type == "fence":
            if token.info.strip() == "mermaid":
                if diagram >= len(DIAGRAMS):
                    raise ValueError("Missing rendered Mermaid image")
                add_picture(doc.add_paragraph(), DIAGRAMS[diagram])
                diagram += 1
            else:
                for line in token.content.rstrip().splitlines():
                    run = doc.add_paragraph().add_run(line)
                    run.font.name = "Consolas"
                    run.font.size = Pt(9)
        i += 1
    if name == "FINAL_PAPER" and diagram != 9:
        raise ValueError(f"Expected nine Mermaid diagrams, got {diagram}")
    update = OxmlElement("w:updateFields")
    update.set(qn("w:val"), "true")
    doc.settings.element.append(update)
    destination = ROOT / f"{name}.docx"
    doc.save(destination)
    print(f"Built {destination.name}: {len(doc.paragraphs)} paragraphs, {len(doc.tables)} tables, {len(doc.inline_shapes)} diagrams")


if __name__ == "__main__":
    for manuscript in ("FINAL_PAPER", "API_DOCUMENTATION"):
        build(manuscript)
