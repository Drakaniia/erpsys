"""Build an editable Word manuscript using the reference PDF's visual structure."""
from pathlib import Path
import argparse
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from markdown_it import MarkdownIt

ROOT = Path(__file__).resolve().parent


def inline(p, text):
    children = MarkdownIt('commonmark').parseInline(text)[0].children or []
    bold = False
    link = None
    for child in children:
        if child.type in ('strong_open', 'strong_close'):
            bold = child.type == 'strong_open'
        elif child.type == 'link_open':
            link = OxmlElement('w:hyperlink')
            relation = p.part.relate_to(child.attrGet('href'), 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink', is_external=True)
            link.set(qn('r:id'), relation)
            p._p.append(link)
        elif child.type == 'link_close':
            link = None
        elif child.type in ('text', 'code_inline'):
            if link is None:
                p.add_run(child.content).bold = bold
            else:
                run = OxmlElement('w:r')
                props = OxmlElement('w:rPr')
                style = OxmlElement('w:rStyle')
                style.set(qn('w:val'), 'Hyperlink')
                props.append(style)
                run.append(props)
                value = OxmlElement('w:t')
                value.text = child.content
                run.append(value)
                link.append(run)


def keep_row(row):
    node = OxmlElement('w:cantSplit')
    row._tr.get_or_add_trPr().append(node)


def build():
    text = (ROOT / 'API_DOCUMENTATION.md').read_text(encoding='utf-8')
    doc = Document()
    section = doc.sections[0]
    section.page_width, section.page_height = Pt(596), Pt(842)
    section.top_margin = section.bottom_margin = Inches(0.75)
    section.left_margin = section.right_margin = Inches(0.85)
    normal = doc.styles['Normal']
    normal.font.name = 'Arial Narrow'
    normal.font.size = Pt(12)
    normal.paragraph_format.space_after = Pt(4)
    normal.paragraph_format.line_spacing = 1.0
    normal.paragraph_format.widow_control = True
    for level in (1, 2, 3):
        style = doc.styles[f'Heading {level}']
        style.font.name = 'Arial Narrow'
        style.font.size = Pt(12)
        style.font.bold = True
        style.font.color.rgb = RGBColor(0, 0, 0)
        style.paragraph_format.keep_with_next = True
        style.paragraph_format.space_after = Pt(8)
    doc.styles['List Bullet'].base_style = normal
    doc.styles['List Bullet'].paragraph_format.left_indent = Inches(0.55)
    doc.styles['List Bullet'].paragraph_format.first_line_indent = Inches(-0.18)
    doc.styles['List Bullet'].paragraph_format.space_after = Pt(4)
    cap = doc.styles['Caption']
    cap.font.name = 'Arial Narrow'
    cap.font.size = Pt(12)
    cap.font.color.rgb = RGBColor(0, 0, 0)
    cap.font.italic = True
    cap.paragraph_format.keep_with_next = True
    cap.paragraph_format.space_after = Pt(10)
    tokens = MarkdownIt('commonmark').enable('table').parse(text)
    i = 0
    in_list = False
    while i < len(tokens):
        token = tokens[i]
        if token.type == 'heading_open':
            title = tokens[i+1].content
            level = int(token.tag[1:])
            p = doc.add_heading(title, level)
            p.paragraph_format.page_break_before = level == 2
            if level == 1:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for run in p.runs:
                    run.font.size = Pt(16)
            i += 2
        elif token.type == 'table_open':
            rows, row = [], None
            while tokens[i].type != 'table_close':
                entry = tokens[i]
                if entry.type == 'tr_open':
                    row = []
                    rows.append(row)
                elif entry.type == 'inline' and row is not None:
                    row.append(entry.content)
                i += 1
            widths = (0.55, 1.65, 4.35)
            table = doc.add_table(rows=0, cols=3)
            table.style = 'Table Grid'
            table.alignment = WD_TABLE_ALIGNMENT.CENTER
            table.autofit = False
            for column, width in zip(table.columns, widths):
                column.width = Inches(width)
            for index, values in enumerate(rows):
                row = table.add_row()
                keep_row(row)
                for cell, value, width in zip(row.cells, values, widths):
                    cell.width = Inches(width)
                    p = cell.paragraphs[0]
                    p.paragraph_format.space_after = Pt(3)
                    p.paragraph_format.space_before = Pt(2)
                    p.paragraph_format.line_spacing = 1.0
                    inline(p, value)
                    for run in p.runs:
                        run.font.size = Pt(11)
                        run.bold = index == 0
                if index == 0:
                    repeat = OxmlElement('w:tblHeader')
                    row._tr.get_or_add_trPr().append(repeat)

        elif token.type == 'bullet_list_open':
            in_list = True
        elif token.type == 'bullet_list_close':
            in_list = False
        elif token.type == 'paragraph_open':
            value = tokens[i+1].content
            if value.startswith('[SCREENSHOT:'):
                p = doc.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p.paragraph_format.keep_with_next = True
                p.paragraph_format.keep_together = True
                p.paragraph_format.space_before = Pt(6)
                p.paragraph_format.space_after = Pt(6)
                p.paragraph_format.line_spacing = 1.0
                p.add_run('INSERT SCREENSHOT HERE').bold = True
                p.add_run().add_break()
                p.add_run(value[13:-1].strip()).font.size = Pt(10)
                border = OxmlElement('w:pBdr')
                for side in ('top', 'left', 'bottom', 'right'):
                    node = OxmlElement('w:'+side)
                    for key, val in (('val', 'single'), ('sz', '4'), ('space', '12'), ('color', '999999')):
                        node.set(qn('w:'+key), val)
                    border.append(node)
                p._p.get_or_add_pPr().append(border)
            elif value.startswith('**Figure '):
                p = doc.add_paragraph(style='Caption')
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                inline(p, value)
            else:
                p = doc.add_paragraph(style='List Bullet' if in_list else None)
                inline(p, value)
                if value.startswith(('**Version:', '**Date:', '**Description:', '**Endpoint:', '**Method:', '**Configurations:', '**Parameters:', '**Important Notes:', '**Reasons a Request')):
                    p.paragraph_format.left_indent = Inches(0.4)

                if value in ('**Valid and Invalid Request Responses**', '**Different Response Screenshots**'):
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    p.paragraph_format.keep_with_next = True
                    p.paragraph_format.space_before = Pt(12)
                if value in ('**Parameters:**', '**Important Notes:**', '**Reasons a Request May Be Refused:**') or value.startswith('Response codes of'):
                    p.paragraph_format.keep_with_next = True
            i += 2
        elif token.type == 'fence':
            raise ValueError('Code block found; screenshots must be supplied by the authors')
        i += 1
    doc.core_properties.title = 'ERPSYS — API Documentation'
    doc.core_properties.subject = 'Reference-style API documentation with editable screenshot placeholders'
    destination = ROOT / 'API_DOCUMENTATION.docx'
    doc.save(destination)
    print(f'Built {destination.name}: {len(doc.tables)} response-code tables; {len(doc.paragraphs)} paragraphs', flush=True)
    return destination


def render():
    import win32com.client
    output = ROOT / 'verification'
    output.mkdir(exist_ok=True)
    word = win32com.client.DispatchEx('Word.Application')
    word.Visible = False
    word.DisplayAlerts = 0
    word.AutomationSecurity = 3
    try:
        document = word.Documents.Open(str(ROOT / 'API_DOCUMENTATION.docx'), ReadOnly=True, AddToRecentFiles=False)
        try:
            document.ExportAsFixedFormat(str(output / 'API_DOCUMENTATION.pdf'), 17)
            print('Rendered verification/API_DOCUMENTATION.pdf', flush=True)
        finally:
            document.Close(False)
    finally:
        word.Quit()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--render', action='store_true')
    args = parser.parse_args()
    build()
    if args.render:
        render()
