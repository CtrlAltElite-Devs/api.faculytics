# Generate Moodle Index

Purpose: generate a searchable index from the Moodle API PDF documentation.

## Source

- PDF: `docs/moodle/moodle_api_documentation.pdf`

## Output

- File: `docs/moodle/moodle_api_index.md`

## Workflow

1. Read the PDF in batches and identify each Moodle web-service function entry.
2. Extract only summary metadata:
   - exact `wsfunction`
   - one-line description
   - start page
   - compact parameter summary
   - abbreviated return shape
   - AJAX availability
3. Write a pipe-delimited index with one function per line.
4. Avoid duplicate entries when a function spans page boundaries.
5. Finalize the header with the generation date and total function count.

## Expected Index Format

Header:

```md
# Moodle API Function Index

Generated from: docs/moodle/moodle_api_documentation.pdf
Generated on: {YYYY-MM-DD}
Total functions: {count}

## How to Use

- By component: `grep "core_message" docs/moodle/moodle_api_index.md`
- By keyword: `grep -i "send.*message" docs/moodle/moodle_api_index.md`
- By action: `grep -i "completion" docs/moodle/moodle_api_index.md`

## Functions

<!-- FORMAT: wsfunction | description | page | params | return_shape | ajax -->
```

Entry:

```text
function_name | description | start_page | params_summary | return_shape | ajax
```

## Constraints

- Keep descriptions concise.
- Do not extract full XML-RPC or REST payload examples.
- Use `...` to abbreviate large return shapes.
- Maintain the PDF's alphabetical ordering.
