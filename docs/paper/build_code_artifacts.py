"""Create the code/artifacts screenshot template without including actual code or images."""
from pathlib import Path
import argparse
import re
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from artifact_figure_text import EXPLANATIONS

ROOT = Path(__file__).resolve().parent
GROUPS = [
    ('1. Sample Code Snippets', [
        ('1.1 Login and Account Security', ['Sign-in and Registration Interface', 'Authentication and Session Handling', 'Administrator Security Verification']),
        ('1.2 Student Records and Enrollment', ['Student Profile and Progress Interface', 'Student Record Request Handler', 'Enrollment Completion Logic']),
        ('1.3 Requirement Evidence and Review', ['Evidence Upload Interface', 'Evidence Submission Request Handler', 'Requirement Approval and Feedback Logic']),
        ('1.4 Enrollment Queue', ['Student Queue Interface', 'Adviser Queue Interface', 'Queue Join and Serving Logic']),
        ('1.5 Departments and Adviser Assignments', ['Department and Assignment Interface', 'Department Request Handler', 'Adviser Assignment Logic']),
        ('1.6 Office Hours and Calendar', ['Office-Hour Schedule Interface', 'Schedule Validation', 'Calendar Connection and Synchronization']),
        ('1.7 Notifications and Reports', ['Notification Interface and Retrieval', 'Report Interface', 'Report Data and PDF Preparation']),
        ('1.8 Account and Integration Administration', ['Account Management Request Handler', 'Integration Settings Interface', 'Credential Validation and Saving']),
        ('1.9 Audit Logs and Enrollment Assistant', ['Activity Log Request Handler', 'Assistant Interface', 'Assistant Reply Stream']),
        ('1.10 Database and Concurrency', ['Database Access Helper', 'Timestamp-Ordering Rules', 'Stale-Update Handling']),
    ]),
    ('2. Coding Standards and Guidelines', [
        ('2.1 Code Formatting', ['Code Formatting Example']),
        ('2.2 Naming Conventions', ['Naming Convention Example']),
        ('2.3 API and Concurrency Comments', ['API Documentation Comment Example', 'Concurrency Comment Example']),
        ('2.4 Code Structure', ['Routes, Services, Models, and Infrastructure Structure']),
        ('2.5 Validation and Error Handling', ['Input Validation and Error Handling Example']),
    ]),
    ('3. Project Management Artifacts', [
        ('3.1 Sprint Planning', ['Sprint Board', 'Product Backlog', 'Sprint Tasks and Progress']),
        ('3.2 Development and Testing Records', ['Version-Control History', 'Code Review or Change Review', 'Test Results']),
    ]),
    ('4. Screenshots of the System', [
        ('4.1 System Access', ['Sign-In Page', 'Student Registration Page', 'Password Recovery Page']),
        ('4.2 Student Interface', ['Student Dashboard and Requirement Progress', 'Enrollment Placement', 'Requirement Evidence Submission', 'Returned Requirement and Feedback', 'Enrollment Queue Position', 'Completed Enrollment Record', 'Student Notifications', 'Enrollment Assistant']),
        ('4.3 SBO Officer Interface', ['Officer Dashboard', 'Requirement Submission List', 'Submission Review and Feedback', 'Mugshot Capture', 'Digital Stamp Settings']),
        ('4.4 Enrollment Adviser Interface', ['Adviser Dashboard and Student Roster', 'Department and Year-Level Assignment', 'Queue Serving and Enrollment Completion', 'Department Handover', 'Office-Hour Schedule', 'Google Calendar Connection']),
        ('4.5 Administrator Interface', ['Administrator Dashboard', 'Academic Year Management', 'Assessment Requirement Management', 'User Account Management', 'Adviser Assignment Management', 'Integration Settings', 'Administrator Security Verification', 'Activity Logs', 'Report Preview']),
    ]),
    ('5. Stakeholder Validation Documents', [
        ('5.1 Partnership and Approval', ['Partnership Document — Page 1', 'Partnership Document — Additional Page', 'Project Approval Document — Page 1', 'Project Approval Document — Additional Page']),
    ]),
]


def manuscript():
    lines = ['# Code Snippets, Project Artifacts, and System Screenshots', '',
             'Template only. Replace each marked space with your own image. Remove unused entries and revise captions after inserting screenshots. Hide credentials and private information.', '']
    figure = 1
    for title, sections in GROUPS:
        lines.extend(['## ' + title, ''])
        for heading, items in sections:
            lines.extend(['### ' + heading, ''])
            for item in items:
                assert re.match(r'This figure (shows|illustrates|demonstrates|depicts|represents)\b', EXPLANATIONS[item])
                lines.extend([f'[IMAGE PLACEHOLDER: {item}]', '', f'**Figure {figure}.** {item}', '', EXPLANATIONS[item], ''])
                figure += 1
    return '\n'.join(lines)


def build():
    text = manuscript()
    source = ROOT / 'CODE_ARTIFACTS_SCREENSHOTS.md'
    source.write_text(text, encoding='utf-8', newline='\n')
    doc = Document()
    section = doc.sections[0]
    section.page_width, section.page_height = Pt(596), Pt(842)
    section.top_margin = section.bottom_margin = Inches(0.75)
    section.left_margin = section.right_margin = Inches(0.85)
    normal = doc.styles['Normal']
    normal.font.name = 'Arial Narrow'
    normal.font.size = Pt(12)
    normal.paragraph_format.space_after = Pt(6)
    for level in (1, 2, 3):
        style = doc.styles[f'Heading {level}']
        style.font.name = 'Arial Narrow'
        style.font.size = Pt(14 if level == 1 else 12)
        style.font.bold = True
        style.font.color.rgb = RGBColor(0, 0, 0)
        style.paragraph_format.keep_with_next = True
    caption = doc.styles['Caption']
    caption.font.name = 'Arial Narrow'
    caption.font.size = Pt(12)
    caption.font.italic = True
    caption.font.color.rgb = RGBColor(0, 0, 0)
    caption.paragraph_format.keep_with_next = True
    for line in text.splitlines():
        if not line:
            continue
        if line.startswith('#'):
            level = len(line.split(' ', 1)[0])
            p = doc.add_heading(line[level+1:], level)
            if level == 1:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            elif level == 2:
                p.paragraph_format.page_break_before = True
        elif line.startswith('[IMAGE PLACEHOLDER:'):
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.keep_with_next = True
            p.paragraph_format.keep_together = True
            p.paragraph_format.space_before = Pt(12)
            p.paragraph_format.space_after = Pt(10)
            p.add_run('INSERT IMAGE HERE').bold = True
            p.add_run().add_break()
            p.add_run(line[len('[IMAGE PLACEHOLDER: '):-1]).font.size = Pt(10)
            p.add_run().add_break()
            p.add_run().add_break()
            border = OxmlElement('w:pBdr')
            for side in ('top', 'left', 'bottom', 'right'):
                node = OxmlElement('w:'+side)
                for key, value in (('val', 'single'), ('sz', '4'), ('space', '10'), ('color', '999999')):
                    node.set(qn('w:'+key), value)
                border.append(node)
            p._p.get_or_add_pPr().append(border)
        elif line.startswith('**Figure '):
            p = doc.add_paragraph(line.replace('**', ''), style='Caption')
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        else:
            doc.add_paragraph(line)
    doc.core_properties.title = 'ERPSYS — Code Snippets, Project Artifacts, and System Screenshots'
    target = ROOT / 'CODE_ARTIFACTS_SCREENSHOTS.docx'
    try:
        doc.save(target)
    except PermissionError:
        target = ROOT / 'CODE_ARTIFACTS_TEMPLATE.docx'
        doc.save(target)
    result = Document(target)
    numbers = [int(n) for n in re.findall(r'^\*\*Figure (\d+)\.\*\*', text, re.M)]
    assert numbers == list(range(1, len(numbers)+1))
    assert sum(p.text.startswith('INSERT IMAGE HERE') for p in result.paragraphs) == len(numbers)
    assert sum(p.style.name == 'Caption' for p in result.paragraphs) == len(numbers)
    assert '```' not in text and len(result.inline_shapes) == 0
    assert len(re.findall(r'^\*\*Figure \d+\.\*\*[^\n]+\n\nThis figure[^\n]+', text, re.M)) == len(numbers)
    for index, paragraph in enumerate(result.paragraphs):
        if paragraph.style.name == 'Caption':
            assert result.paragraphs[index + 1].text.startswith('This figure')
    print(f'PASS: {target.name} created with {len(numbers)} image placeholders and matching Figure captions.', flush=True)
    return target


def render(target):
    import win32com.client
    word = win32com.client.DispatchEx('Word.Application')
    word.Visible = False
    word.DisplayAlerts = 0
    word.AutomationSecurity = 3
    try:
        doc = word.Documents.Open(str(target), ReadOnly=True, AddToRecentFiles=False)
        try:
            doc.ExportAsFixedFormat(str(ROOT / 'verification/CODE_ARTIFACTS_SCREENSHOTS.pdf'), 17)
        finally:
            doc.Close(False)
    finally:
        word.Quit()
    print('Rendered template for layout verification.', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--render', action='store_true')
    args = parser.parse_args()
    target = build()
    if args.render:
        render(target)
