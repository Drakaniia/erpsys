"""Check manuscript constraints and optionally render both Word documents.

Usage: python docs/paper/verify_documents.py [--render]
Rendering uses an isolated Microsoft Word automation instance on Windows.
"""
import argparse
import pathlib
import re
import sys

from docx import Document

ROOT = pathlib.Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--render", action="store_true")
parser.add_argument("--api-only", action="store_true", help="Validate only the standalone API document")
args = parser.parse_args()
manuscripts = ("API_DOCUMENTATION",) if args.api_only else ("FINAL_PAPER", "API_DOCUMENTATION")
for name in manuscripts:
    text = (ROOT / f"{name}.md").read_text(encoding="utf-8")
    doc = Document(ROOT / f"{name}.docx")
    visible = "\n".join([p.text for p in doc.paragraphs] + [c.text for t in doc.tables for r in t.rows for c in r.cells])
    forbidden = r"(?i)\bnginx\b|ENROLLMENT_ADVISER|SBO_OFFICER|apps/(?:server|web)/|\b[\w/-]+\.tsx?\b"
    assert not re.search(forbidden, text + visible), f"Prohibited content in {name}"
    assert (ROOT / f"{name}.docx").stat().st_size > 10000
    if name == "FINAL_PAPER":
        assert len(re.findall(r"^# Chapter [1-5]", text, re.M)) == 5
        assert "# API Documentation" not in text
        functional = text.split("### 2.2.1 Functional Requirements", 1)[1].split("### 2.2.2", 1)[0]
        nonfunctional = text.split("### 2.2.2 Non-Functional Requirements", 1)[1].split("### 2.2.3", 1)[0]
        assert "| Component |" not in functional
        assert "| Verification |" not in nonfunctional
        assert all(len(line.strip().strip("|").split("|")) == 2 for line in (functional + nonfunctional).splitlines() if line.startswith("|"))
        integrations = text.split("## 3.5. Integration Strategies", 1)[1].split("# Chapter 4", 1)[0]
        assert not any(line.startswith("|") for line in integrations.splitlines())
        assert all(term in text for term in ("API (Application Programming Interface)", "Concurrency", "RBAC (Role-Based Access Control)", "JWT (JSON Web Token)"))
        assert len(doc.inline_shapes) == 10
        assert "nginx" not in (ROOT / "diagrams/4-1-physical.svg").read_text(encoding="utf-8").lower()
    else:
        from api2paper import check as check_api
        check_api(text)
        headings = re.findall(r"^### (.+)$", text, re.M)
        from api2paper import current_routes
        from api_auth_contracts import AUTH_ENDPOINTS
        from api_paper_content import MODULES
        expected_endpoints = len(current_routes()) + len(AUTH_ENDPOINTS)
        assert len(headings) == expected_endpoints + len(MODULES), "Missing module or endpoint sections"
        assert len(doc.tables) == expected_endpoints, "Each endpoint needs a response-code table"
        assert "```" not in text and "{" not in visible and "}" not in visible, "Code example remains"
        captions = [p for p in doc.paragraphs if p.style.name == "Caption"]
        figure_count = len(re.findall(r'^\*\*Figure \d+\.\*\*', text, re.M))
        assert len(captions) == figure_count, "Screenshot figure count mismatch"
        for index, paragraph in enumerate(doc.paragraphs):
            if paragraph.style.name == 'Caption':
                assert re.match(r'This figure (shows|illustrates|demonstrates|depicts|represents)\b', doc.paragraphs[index + 1].text), 'Figure description is missing'
        assert sum(p.text == "Version: 1.0" for p in doc.paragraphs) == expected_endpoints
        date_lines = [p.text for p in doc.paragraphs if p.text.startswith('Date:')]
        assert len(date_lines) == expected_endpoints
        assert all(re.fullmatch(r'Date: November (1[4-9]|20), 2026', value) for value in date_lines)
        from docx.oxml.ns import qn
        endpoints = [p for p in doc.paragraphs if p.text.startswith("Endpoint:")]
        assert len(endpoints) == expected_endpoints
        for paragraph in endpoints:
            links = paragraph._p.findall(qn('w:hyperlink'))
            assert len(links) == 1, "Each endpoint needs a full URL hyperlink"
            target = doc.part.rels[links[0].get(qn('r:id'))].target_ref
            assert target.startswith('http://localhost:3001/'), "Wrong endpoint base address"
        assert all(2 <= len(t.rows) <= 4 for t in doc.tables), "Keep only key status codes"
        assert sum(p.text.startswith("INSERT SCREENSHOT HERE") for p in doc.paragraphs) == len(captions)
        word_headings = [p.text for p in doc.paragraphs if p.style.name == "Heading 3"]
        assert word_headings == headings, "Word endpoint sections differ from the manuscript"
        required = ("/me/schedule", "/me/calendar", "/integrations/credentials/export", "/admin-gate/status", "TS_ABORTED",
                    "/email-otp/send-verification-otp", "/sign-in/email-otp", "/email-otp/verify-email",
                    "All existing sessions for the account are ended")
        assert all(value in text for value in required)
    print(f"PASS {name}: manuscript constraints and Word structure")

if args.render:
    if sys.platform != "win32":
        sys.exit("Word rendering requires Windows")
    import win32com.client
    output = ROOT / "verification"
    output.mkdir(exist_ok=True)
    word = win32com.client.DispatchEx("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0
    word.AutomationSecurity = 3
    try:
        for name in manuscripts:
            doc = word.Documents.Open(str(ROOT / f"{name}.docx"), ReadOnly=False, AddToRecentFiles=False)
            try:
                doc.ExportAsFixedFormat(str(output / f"{name}.pdf"), 17)
                print(f"Rendered {name}")
            finally:
                doc.Close(False)
    finally:
        word.Quit()
