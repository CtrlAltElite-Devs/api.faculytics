---
name: 'generate-moodle-index'
description: 'Generate a searchable index from the Moodle API PDF documentation'
---

# Generate Moodle API Index

You are a documentation indexer. Your job is to read the Moodle API PDF and generate a searchable index file that the `moodle-api-agent` will use to look up API functions.

## Source

PDF: `docs/moodle/moodle_api_documentation.pdf` (3084 pages)

## Output

File: `docs/moodle/moodle_api_index.md`

## PDF Structure

Each function entry in the PDF follows this consistent pattern:

1. **Function name** — bold text like `core_message_send_instant_messages`
2. **Description** — boxed one-liner describing the function
3. **Arguments** section — each parameter with:
   - Name, Required/Optional marker, description
   - General structure (type)
   - REST (POST parameters) encoding
4. **Response** section — General structure with field names, types, defaults, descriptions
5. **Error message** section
6. **Restricted to logged-in users** — Yes/No
7. **Callable from AJAX** — Yes/No

Functions are listed alphabetically. Each function spans approximately 2-5 pages.

## Index Format

Write a pipe-delimited index file with one line per function, optimized for grep search.

### Header

```markdown
# Moodle API Function Index

Generated from: docs/moodle/moodle_api_documentation.pdf
Generated on: {YYYY-MM-DD}
Total functions: {count}

## How to Use

This index is used by the `/moodle-api-agent` command. Search with grep:

- By component: `grep "core_message" docs/moodle/moodle_api_index.md`
- By keyword: `grep -i "send.*message" docs/moodle/moodle_api_index.md`
- By action: `grep -i "completion" docs/moodle/moodle_api_index.md`

## Functions

<!-- FORMAT: wsfunction | description | page | params | return_shape | ajax -->
```

### Entry Format

Each function gets exactly one line:

```
function_name | description | start_page | params_summary | return_shape | ajax
```

Where:

- **function_name**: The exact `wsfunction` value (e.g., `core_enrol_get_enrolled_users`)
- **description**: The one-line description from the description box
- **start_page**: The PDF page number where this function starts
- **params_summary**: Compact parameter list using the notation:
  - Simple params: `paramname(type,req)` or `paramname(type,opt)`
  - Array of scalars: `paramname[](type)`
  - Array of objects: `paramname[](field1,field2,field3)`
  - Defaults: `paramname(type,opt,default=X)`
- **return_shape**: Abbreviated structure:
  - Objects: `{field1,field2,field3}`
  - Arrays of objects: `[{field1,field2,...}]`
  - Nested: `{completionstatus:{completed,completions[]},warnings[]}`
  - Use `...` to abbreviate when more than 8 fields
- **ajax**: `yes` or `no` (from the "Callable from AJAX" field)

### Example Lines

```
aiplacement_courseassist_explain_text | Explain text for the Course Assistance Placement | 1 | contextid(int,req), prompttext(string,req) | {success,timecreated,prompttext,generatedcontent,finishreason,error,errormessage} | yes
core_enrol_get_enrolled_users | Get enrolled users by course id | 845 | courseid(int,req), options[](name,value) | [{id,username,firstname,lastname,...,roles[],enrolledcourses[]}] | yes
core_course_get_courses_by_field | Get courses matching a specific field | 710 | field(string,req), value(string,req) | {courses:[{id,fullname,shortname,...}],warnings[]} | yes
```

## Process

### Step 1: Read in batches

Read the PDF in batches of 20 pages (the maximum allowed per read):

- Batch 1: pages 1-20
- Batch 2: pages 21-40
- ...continue until page 3084

### Step 2: Extract function entries

For each batch, identify every function entry. A function entry starts when you see a function name in the format `component_action` or `component_subcomponent_action` (e.g., `core_message_send_instant_messages`, `mod_assign_get_assignments`).

For each function found, extract:

1. The exact function name
2. The description text
3. The current page number
4. All parameter names with their types and required/optional status (from the Arguments section)
5. The response structure field names and types (from the Response General structure)
6. The "Callable from AJAX" value

### Step 3: Handle page boundaries

A function may span across two batches (start in one batch, end in the next). Handle this by:

- If you encounter a function that starts but its entry is incomplete (cut off at the batch boundary), note it and complete it in the next batch
- Do NOT create duplicate entries — if you already recorded a function, skip it in subsequent batches

### Step 4: Write incrementally

After processing each batch:

- Append the extracted entries to `docs/moodle/moodle_api_index.md`
- Report progress: "Processed pages X-Y: found N functions (total so far: M)"

### Step 5: Finalize

After all batches are processed:

1. Update the header with the final function count
2. Verify the file is well-formed (no duplicate entries, no malformed lines)
3. Report the final count and any issues encountered

## Important Notes

- Only extract metadata (name, description, page, params summary, return shape, ajax flag)
- Do NOT extract full XML-RPC structures, REST XML structures, or error message XML
- The detailed documentation will be read on-demand from the PDF by the `moodle-api-agent`
- Keep descriptions concise — use the exact text from the description box, truncate if over 100 chars
- For return shapes with many fields (>8), use `...` to abbreviate: `{id,username,firstname,...}`
- Alphabetical order is inherited from the PDF — maintain it
