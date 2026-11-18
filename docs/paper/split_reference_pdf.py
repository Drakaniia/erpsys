from hashlib import sha256
from pathlib import Path

import fitz
from pypdf import PdfReader, PdfWriter


def main():
    folder = Path(__file__).resolve().parent
    source = folder / "Collab Final Project Documentation.REFERENCE.pdf"
    original_hash = sha256(source.read_bytes()).digest()
    sections = [
        (1, 60, "MAIN_CHAPTER.REFERENCE.pdf"),
        (61, 212, "API_DOCUMENTATION.REFERENCE.pdf"),
        (213, 259, "CODE_ARTIFACTS_SCREENSHOTS.REFERENCE.pdf"),
    ]
    reader = PdfReader(source)
    assert len(reader.pages) == 259, "Expected exactly 259 source pages"
    assert all(not (folder / name).exists() for _, _, name in sections), "An output already exists"
    with fitz.open(source) as original:
        for start, end, name in sections:
            destination = folder / name
            writer = PdfWriter()
            for page in reader.pages[start - 1:end]:
                writer.add_page(page)
            writer.write(destination)
            writer.close()
            with fitz.open(destination) as result:
                assert len(result) == end - start + 1
                for index, page in enumerate(result):
                    expected = original[start - 1 + index]
                    assert page.rect == expected.rect, f"Page size mismatch: {name}, {index + 1}"
                    assert page.get_text() == expected.get_text(), f"Text mismatch: {name}, {index + 1}"
                    assert page.get_pixmap(matrix=fitz.Matrix(0.5, 0.5)).digest == expected.get_pixmap(matrix=fitz.Matrix(0.5, 0.5)).digest, f"Rendering mismatch: {name}, {index + 1}"
            print(f"Verified {name}: source pages {start}-{end}, {end - start + 1} pages", flush=True)
    assert sha256(source.read_bytes()).digest() == original_hash, "Source PDF changed"
    print("PASS: All 259 pages match the source text, dimensions, and rendering; original unchanged.", flush=True)


if __name__ == "__main__":
    main()
