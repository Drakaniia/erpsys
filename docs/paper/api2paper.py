"""Build the standalone reference-style API manuscript.

Usage: python docs/paper/api2paper.py [--check]
Checks mounted routes, section coverage, response tables, and screenshot numbering.
"""
import argparse
from pathlib import Path
import re

from api_contracts import CONTRACTS
import api_student_contracts
from api_auth_contracts import AUTH_ENDPOINTS

ROOT = Path(__file__).resolve().parent
RESOURCE = ROOT.parent.parent / 'apps/server/src/routes'
ROUTE_PATTERN = re.compile(r'\w+Router\.(get|post|put|patch|delete)\(\s*"([^"]+)"', re.S)


def current_routes():
    index = (RESOURCE / 'index.ts').read_text(encoding='utf-8')
    mounted = set(re.findall(r'v1Router\.use\((\w+Router)\)', index))
    imports = re.findall(r'import \{ (\w+Router) \} from "\./([^/]+)/index\.js";', index)
    groups = [group for symbol, group in imports if symbol in mounted] + ['chat']
    result = []
    for group in groups:
        text = (RESOURCE / group / 'index.ts').read_text(encoding='utf-8')
        for match in ROUTE_PATTERN.finditer(text):
            method, path = match.groups()
            before = text[:match.start()]
            block = before[before.rfind('/**'):]
            access = re.search(r'Access: (.*?)\.', block)
            prefix = '/api' if group == 'chat' else '/api/v1'
            result.append((group, method.upper(), prefix + path, access.group(1) if access else 'session'))
    result.append(('system', 'GET', '/api/health', 'public'))
    return result


def generate():
    from api_reference import generate as generate_reference
    return generate_reference()


def check(text):
    from api_reference import check as check_reference
    check_reference(text)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    target = ROOT / 'API_DOCUMENTATION.md'
    if not args.check:
        target.write_text(generate(), encoding='utf-8', newline='\n')
    check(target.read_text(encoding='utf-8'))
    if not args.check:
        print(f'Built {target.name}')
