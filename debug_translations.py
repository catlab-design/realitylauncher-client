
import re

file_path = r"e:\mlauncher\ml-client\src\i18n\translations.ts"
output_path = r"e:\mlauncher\ml-client\debug_translations.log"

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

with open(output_path, 'w', encoding='utf-8') as out:
    out.write(f"Total lines: {len(lines)}\n")

    brace_depth = 0
    in_translations = False

    for i, line in enumerate(lines):
        # Scan inside string literals to ensure we don't match text inside quotes? 
        # For simplicity, naive regex is fine for now as keys are usually at start of line
        
        if "export const translations =" in line:
            in_translations = True
            out.write(f"Found translations start at line {i+1}\n")
            
        if not in_translations:
            continue

        brace_depth += line.count('{')
        brace_depth -= line.count('}')

        # Check for keys at depth 1 (inside translations object)
        # match "    key:" or "    key: {"
        match = re.search(r'^\s*([a-zA-Z0-9_]+):', line)
        if match:
            key = match.group(1)
            # Only record keys at depth 1 (siblings of th)
            # export const translations = {  <- depth starts at 0, becomes 1
            #    th: { <- depth 1. brace_depth becomes 2 after this line
            
            # Since brace_depth is updated relative to current line, we need to correct logic
            # If line has '{', depth increases AFTER
            # We want keys at indentation relative to 'translations = {'
             
            out.write(f"Line {i+1}: Key '{key}' (Indent: {len(line) - len(line.lstrip())})\n")
            
        if re.search(r'\ben:\s', line):
             out.write(f"Found 'en:' pattern at line {i+1}\n")

