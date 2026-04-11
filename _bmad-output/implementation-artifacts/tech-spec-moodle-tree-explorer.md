---
title: 'Moodle Tree Explorer for Admin Provisioning'
slug: 'moodle-tree-explorer'
created: '2026-04-11'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  [
    'NestJS 11',
    'MikroORM 6',
    'PostgreSQL',
    'React 19',
    'Vite 8',
    'TypeScript 5',
    'shadcn/ui',
    'TanStack Query',
    'Zustand',
    'Radix UI',
  ]
files_to_modify:
  # API (api.faculytics)
  - 'src/modules/moodle/controllers/moodle-provisioning.controller.ts'
  - 'src/modules/moodle/services/moodle-provisioning.service.ts'
  - 'src/modules/moodle/moodle.service.ts'
  - 'src/modules/moodle/dto/responses/moodle-tree.response.dto.ts [NEW]'
  - 'src/modules/moodle/dto/responses/moodle-course-preview.response.dto.ts [NEW]'
  - 'src/modules/moodle/services/moodle-provisioning.service.spec.ts [NEW]'
  # Admin Frontend (admin.faculytics)
  - 'src/components/ui/collapsible.tsx [NEW]'
  - 'src/features/moodle-provision/provision-page.tsx'
  - 'src/features/moodle-provision/components/moodle-tree-sheet.tsx [NEW]'
  - 'src/features/moodle-provision/components/category-tree-node.tsx [NEW]'
  - 'src/features/moodle-provision/components/category-course-list.tsx [NEW]'
  - 'src/features/moodle-provision/use-moodle-tree.ts [NEW]'
  - 'src/features/moodle-provision/use-category-courses.ts [NEW]'
  - 'src/types/api.ts'
  - 'src/features/moodle-provision/components/categories-tab.tsx'
  - 'src/features/moodle-provision/components/courses-bulk-tab.tsx'
  - 'src/features/moodle-provision/components/quick-course-tab.tsx'
code_patterns:
  - 'PascalCase public service methods'
  - 'class-validator + @ApiProperty DTOs'
  - '@UseJwtGuard(UserRole.SUPER_ADMIN) for admin endpoints'
  - '@Audited() decorator for audit trail'
  - 'apiClient<T>(path, options) fetch wrapper'
  - 'useQuery with queryKey: [feature, envId, ...params]'
  - 'useMutation with onSuccess/onError + toast'
  - 'Sheet + ScrollArea for side panels'
test_patterns:
  - 'Jest with NestJS TestingModule for API unit tests'
  - 'Mocked services via { provide: Dep, useValue: { method: jest.fn() } }'
  - 'No frontend tests in admin.faculytics'
---

# Tech-Spec: Moodle Tree Explorer for Admin Provisioning

**Created:** 2026-04-11

## Overview

### Problem Statement

When provisioning categories or courses in the admin console, admins have no visibility into what already exists in Moodle. They work blind — risking duplicate provisioning and confusion about the current hierarchy state. There is no way to browse the live Moodle category hierarchy or see which courses are under which categories before provisioning.

### Solution

Add a browsable tree view of the Moodle category hierarchy (Campus → Semester → Department → Program → Courses) to the admin provisioning page, with on-demand course listing per category. This gives admins ground-truth visibility into the Moodle state before they provision new resources.

### Scope

**In Scope:**

- API endpoint(s) to fetch Moodle categories as a nested tree structure + courses per category
- Frontend tree viewer component in admin.faculytics
- Integration with the existing provisioning page at `/moodle-provision`

**Out of Scope:**

- Editing/deleting Moodle categories from the tree
- Triggering sync from the tree view
- Bulk operations from the tree
- Modifying existing provision tab logic or form behavior (tabs only gain a "Browse existing" button)

## Context for Development

### Codebase Patterns

**API (api.faculytics):**

- `MoodleClient` (`src/modules/moodle/lib/moodle.client.ts`) wraps Moodle REST API with typed `call<T>()` method, 10s default timeout
- `MoodleService.GetCategoriesWithMasterKey()` returns flat `MoodleCategoryResponse[]` using master key (no user token needed)
- `MoodleService.GetCoursesByCategory(token, categoryId)` calls `getCoursesByField('category', id)` — needs a master-key variant
- `MoodleProvisioningService` (`src/modules/moodle/services/moodle-provisioning.service.ts`) already injects `MoodleService` — new tree/course methods go here to avoid changing controller dependencies
- Controller pattern: `@ApiTags` + `@Controller('moodle/provision')` + `@UseJwtGuard(UserRole.SUPER_ADMIN)` + `@ApiBearerAuth()` + `@Audited()` + interceptor stack
- `MoodleClient` throws `MoodleConnectivityError` on network/timeout failures — must be caught and mapped to HTTP 502/503 at controller layer
- DTOs use `class-validator` decorators + `@ApiProperty` for Swagger
- Public service methods use PascalCase
- Module default-exports, registers controllers/providers explicitly

**Admin Frontend (admin.faculytics):**

- `apiClient<T>(path, options)` — fetch wrapper auto-prefixing `/api/v1/`, injects Bearer token, handles 401 refresh
- Query key convention: `['feature-name', envId, ...params]`
- Mutations: `useMutation` with `onSuccess`/`onError` + `toast` from Sonner
- Provisioning page: Tabs layout with separate components per tab, local `useState` for form state
- Existing shadcn components available: Sheet, ScrollArea, Tooltip, Badge, Button, Card
- Missing shadcn component: **Collapsible** (needed for tree expand/collapse — install via `bunx shadcn add collapsible`)

**Moodle Category Structure:**

- `MoodleCategoryResponse`: `id`, `name`, `parent` (0=root), `depth` (1-4), `path` ("/1/2/5"), `coursecount`, `visible`
- `MoodleCourse`: `id`, `shortname`, `fullname`, `category` (parent ID), `enrolledusercount`, `visible`, `startdate`, `enddate`
- Tree must be constructed from flat array using `parent` field — no existing tree-builder utility for API responses

### Files to Reference

| File                                                                    | Purpose                                                                                 |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `api: src/modules/moodle/services/moodle-provisioning.service.ts`       | Provisioning service — add tree + course methods here (already injects `MoodleService`) |
| `api: src/modules/moodle/moodle.service.ts`                             | Service with `GetCategoriesWithMasterKey()` — called by provisioning service            |
| `api: src/modules/moodle/lib/moodle.client.ts`                          | Low-level Moodle REST client — no changes needed, methods exist                         |
| `api: src/modules/moodle/controllers/moodle-provisioning.controller.ts` | Provisioning controller — add 2 new GET endpoints here                                  |
| `api: src/modules/moodle/dto/responses/moodle-category.response.dto.ts` | Existing category DTO — reference for tree node structure                               |
| `api: src/modules/moodle/dto/responses/course.response.dto.ts`          | Existing course DTO — reference for course preview fields                               |
| `api: src/modules/moodle/moodle.module.ts`                              | Module registration — no changes needed if using existing service                       |
| `admin: src/features/moodle-provision/provision-page.tsx`               | Tab layout wrapper — add Sheet state + mount here (shared across all tabs)              |
| `admin: src/features/moodle-provision/components/categories-tab.tsx`    | Add "Browse existing" button after departments section                                  |
| `admin: src/features/moodle-provision/components/courses-bulk-tab.tsx`  | Add "Browse existing" button in upload view                                             |
| `admin: src/features/moodle-provision/components/quick-course-tab.tsx`  | Add "Browse existing" button after program input                                        |
| `admin: src/lib/api-client.ts`                                          | Fetch wrapper — no changes needed                                                       |
| `admin: src/types/api.ts`                                               | Add new tree/course preview response types                                              |
| `admin: src/components/ui/sheet.tsx`                                    | Existing Sheet component (Radix UI based)                                               |
| `admin: src/components/ui/scroll-area.tsx`                              | Existing ScrollArea component                                                           |
| `admin: src/components/ui/tooltip.tsx`                                  | Existing Tooltip component                                                              |

### Technical Decisions (Resolved via Party Mode)

1. **Data source:** Live Moodle via master key. Client-side `staleTime` of 2-3 minutes. Manual refresh button with "Last fetched" timestamp for trust.
2. **UX placement:** Side panel (Sheet) accessible from any provision tab. Context-aware entry points ("Browse existing" links near relevant inputs). Sheet opens at relevant depth based on active tab.
3. **Interaction depth:** Read-only browse for V1. No cross-filling of provision forms. Click-to-copy on category names and Moodle IDs for reference.
4. **Course detail level:** Show shortname, fullname, enrolled user count, visible status, moodleId (click-to-copy). Start/end dates in hover tooltip only.

## Implementation Plan

### Tasks

#### Phase 1: API — Response DTOs (no dependencies)

- [x] Task 1: Create tree response DTO
  - File: `api.faculytics/src/modules/moodle/dto/responses/moodle-tree.response.dto.ts` [NEW]
  - Action: Create two classes:
    - `MoodleCategoryTreeNodeDto` — `id: number`, `name: string`, `depth: number`, `coursecount: number`, `visible: number`, `children: MoodleCategoryTreeNodeDto[]`. Use `class-validator` decorators (`@IsNumber`, `@IsString`, `@IsArray`, `@ValidateNested({ each: true })`). Import `@Type` from `class-transformer` (separate package from `class-validator`) and add `@Type(() => MoodleCategoryTreeNodeDto)` on `children` for recursive Swagger schema. Add `@ApiProperty` on all fields with recursive type annotation on `children`.
    - `MoodleCategoryTreeResponseDto` — `tree: MoodleCategoryTreeNodeDto[]`, `fetchedAt: string` (ISO timestamp), `totalCategories: number`. Add `@ApiProperty` decorators.

- [x] Task 2: Create course preview response DTO
  - File: `api.faculytics/src/modules/moodle/dto/responses/moodle-course-preview.response.dto.ts` [NEW]
  - Action: Create two classes:
    - `MoodleCoursePreviewDto` — `id: number`, `shortname: string`, `fullname: string`, `enrolledusercount?: number` (optional — availability depends on Moodle version and master key permissions), `visible: number`, `startdate: number`, `enddate: number`. Use `class-validator` + `@ApiProperty`. Mark `enrolledusercount` with `@IsOptional()` and `@ApiPropertyOptional()`. Import `@Type` from `class-transformer` for nested validation.
    - `MoodleCategoryCoursesResponseDto` — `categoryId: number`, `courses: MoodleCoursePreviewDto[]`. Use `@ValidateNested({ each: true })` + `@Type(() => MoodleCoursePreviewDto)`.
  - Notes: `categoryName` is intentionally excluded — the frontend already has it from the tree data and passes it as a prop. This avoids a redundant full-category fetch on every course-list request.

#### Phase 2: API — Service Methods (depends on Phase 1)

- [x] Task 3: Add tree-building service method
  - File: `api.faculytics/src/modules/moodle/services/moodle-provisioning.service.ts`
  - Action: Add `async GetCategoryTree(): Promise<MoodleCategoryTreeResponseDto>` method:
    1. Call `this.moodleService.GetCategoriesWithMasterKey()` to get flat `MoodleCategoryResponse[]`
    2. Build nested tree using O(n) three-pass algorithm:
       - **Pass 1 — Create nodes:** Iterate flat array. For each `MoodleCategoryResponse`, create a `MoodleCategoryTreeNodeDto` by mapping only DTO fields: `{ id: cat.id, name: cat.name, depth: cat.depth, coursecount: cat.coursecount, visible: cat.visible, children: [] }`. Store in `Map<number, MoodleCategoryTreeNodeDto>` keyed by `id`. Also store sortorder in a separate `Map<number, number>` (`sortorderMap.set(cat.id, cat.sortorder)`) for sorting in step 3.
       - **Pass 2 — Attach children:** Iterate flat array again. For each category, look up parent node in Map via `cat.parent`. If parent exists, push current node into `parent.children`. If `cat.parent === 0`, add to `rootNodes[]`.
    3. **Pass 3 — Sort children:** Iterate all nodes in the Map. For each node with `children.length > 1`, sort `children` by `sortorderMap.get(child.id)` ascending (preserves Moodle admin's intended ordering, NOT alphabetical). Also sort `rootNodes` by sortorder. `sortorder` is used for sorting only — it is NOT included in the DTO or API response.
    4. Return `{ tree: rootNodes, fetchedAt: new Date().toISOString(), totalCategories: flat.length }`
  - Notes: O(n) three-pass algorithm (create, attach, sort). No recursion needed. `MoodleProvisioningService` already injects `MoodleService`, so `GetCategoriesWithMasterKey()` is available directly.

- [x] Task 4: Add master-key course-by-category method
  - File: `api.faculytics/src/modules/moodle/services/moodle-provisioning.service.ts`
  - Action:
    1. **First, add helper to `MoodleService`** (`src/modules/moodle/moodle.service.ts`): Add method `async GetCoursesByFieldWithMasterKey(field: string, value: string): Promise<{ courses: MoodleCourse[] }>` — one-liner: `return this.BuildMasterClient().getCoursesByField(field, value)`. Follows same pattern as existing `GetCategoriesWithMasterKey()`.
    2. **Then, add to `MoodleProvisioningService`**: `async GetCoursesByCategoryWithMasterKey(categoryId: number): Promise<MoodleCategoryCoursesResponseDto>`:
       - Call `const { courses } = await this.moodleService.GetCoursesByFieldWithMasterKey('category', categoryId.toString())` — destructure `courses` from the `{ courses: MoodleCourse[] }` wrapper
       - Map `courses` array to `MoodleCoursePreviewDto[]` — pick only: `{ id, shortname, fullname, enrolledusercount, visible, startdate, enddate }`
       - Return `{ categoryId, courses }`
  - Notes: No `categoryName` in response — frontend already has it from the tree. No redundant category fetch needed. `enrolledusercount` may be `undefined` at runtime despite `MoodleCourse` declaring it required — Moodle API responses are JSON-parsed via `response.json() as T` with no class-transformer validation, so missing fields silently become `undefined`.

#### Phase 3: API — Controller Endpoints (depends on Phase 2)

- [x] Task 5: Add GET /moodle/provision/tree endpoint
  - File: `api.faculytics/src/modules/moodle/controllers/moodle-provisioning.controller.ts`
  - Action: Add endpoint method:
    ```
    @Get('tree')
    @UseJwtGuard(UserRole.SUPER_ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Fetch Moodle category tree (live)' })
    @ApiResponse({ status: 200, type: MoodleCategoryTreeResponseDto })
    async GetCategoryTree(): Promise<MoodleCategoryTreeResponseDto>
    ```
    Call `this.provisioningService.GetCategoryTree()` and return result.
    Wrap in try/catch:
    - `MoodleConnectivityError` → `throw new BadGatewayException('Moodle is unreachable')`
    - Generic `Error` → `throw new ServiceUnavailableException('Moodle returned an error: ' + e.message)`
  - **New imports required for controller** (these are not currently imported):
    - `@nestjs/common`: add `Get`, `Param`, `ParseIntPipe`, `BadGatewayException`, `ServiceUnavailableException` to existing import (`BadRequestException` is already imported)
    - `@nestjs/swagger`: `ApiParam`, `ApiBearerAuth`
    - `src/modules/moodle/lib/moodle.client`: `MoodleConnectivityError`
    - Response DTOs from their respective new files
  - Notes: GET (not POST) since this is a read-only fetch. No `@Audited()` needed — read-only endpoint, no audit trail or metadata injection needed. No `@UseInterceptors()`. No `@Body()` — no request parameters. `@ApiBearerAuth()` enables Swagger "Authorize" button for testing. Note: existing POST endpoints on this controller lack `@ApiBearerAuth()` — this is known tech debt; adding at class level is out of scope for this feature.

- [x] Task 6: Add GET /moodle/provision/tree/:categoryId/courses endpoint
  - File: `api.faculytics/src/modules/moodle/controllers/moodle-provisioning.controller.ts`
  - Action: Add endpoint method:
    ```
    @Get('tree/:categoryId/courses')
    @UseJwtGuard(UserRole.SUPER_ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Fetch courses for a Moodle category (live)' })
    @ApiResponse({ status: 200, type: MoodleCategoryCoursesResponseDto })
    @ApiParam({ name: 'categoryId', type: Number })
    async GetCategoryCourses(@Param('categoryId', ParseIntPipe) categoryId: number): Promise<MoodleCategoryCoursesResponseDto>
    ```
    Add input validation: `if (categoryId < 1) throw new BadRequestException('Category ID must be a positive integer')`
    Call `this.provisioningService.GetCoursesByCategoryWithMasterKey(categoryId)` and return result.
    Wrap in same try/catch pattern as Task 5 for Moodle error mapping.
  - Notes: Use `ParseIntPipe` to validate and convert the path param. Import `@ApiParam`, `@ApiBearerAuth` from `@nestjs/swagger`. Import `BadGatewayException`, `ServiceUnavailableException`, `BadRequestException` from `@nestjs/common`.

#### Phase 4: API — Unit Tests (depends on Phase 3)

- [x] Task 7: Add service unit tests for tree building
  - File: `api.faculytics/src/modules/moodle/services/moodle-provisioning.service.spec.ts` [NEW]
  - Setup: Create `TestingModule` with all 5 constructor dependencies:
    ```typescript
    const module = await Test.createTestingModule({
      providers: [
        MoodleProvisioningService,
        {
          provide: MoodleService,
          useValue: {
            GetCategoriesWithMasterKey: jest.fn(),
            GetCoursesByFieldWithMasterKey: jest.fn(),
          },
        },
        { provide: EntityManager, useValue: {} },
        { provide: MoodleCourseTransformService, useValue: {} },
        { provide: MoodleCsvParserService, useValue: {} },
        { provide: MoodleCategorySyncService, useValue: {} },
      ],
    }).compile();
    ```
    Only `MoodleService` needs real mock methods. The other 4 are empty stubs — tree/course methods don't touch them.
  - Action: Test `GetCategoryTree()`:
    - Mock `MoodleService.GetCategoriesWithMasterKey()` to return a flat array of 7-8 categories across 4 depths with `sortorder` values
    - Assert returned tree has correct nesting (depth 1 at root, depth 2 as children of depth 1, etc.)
    - Assert children are sorted by `sortorder` ascending (not alphabetical)
    - Assert field mapping: only `id`, `name`, `depth`, `coursecount`, `visible`, `children` (6 fields) — no `sortorder` or other extra fields from `MoodleCategoryResponse` (sortorder is used for ordering only, not serialized)
    - Assert `totalCategories` matches input count
    - Assert `fetchedAt` is a valid ISO string
    - Edge case: empty category list returns `{ tree: [], totalCategories: 0, fetchedAt: <valid ISO string> }`
  - Test `GetCoursesByCategoryWithMasterKey()`:
    - Mock `MoodleService.GetCoursesByFieldWithMasterKey()` to return `{ courses: [3 mock courses] }`
    - Assert response contains each named field: `id`, `shortname`, `fullname`, `visible`, `startdate`, `enddate`, and optionally `enrolledusercount` (may be `undefined`)
    - Assert `categoryId` is echoed back, no `categoryName` in response

#### Phase 5: Frontend — Setup & Types (no dependencies)

- [x] Task 8: Install Collapsible shadcn component
  - File: `admin.faculytics/src/components/ui/collapsible.tsx` [NEW]
  - Action: Run `cd ../admin.faculytics && bunx shadcn add collapsible`
  - Notes: This installs the Radix UI Collapsible primitive wrapper.

- [x] Task 9: Add tree response types
  - File: `admin.faculytics/src/types/api.ts`
  - Action: Add TypeScript interfaces matching API DTOs:

    ```typescript
    export interface MoodleCategoryTreeNode {
      id: number;
      name: string;
      depth: number;
      coursecount: number;
      /** 0=hidden, 1=visible (Moodle convention) */
      visible: number;
      children: MoodleCategoryTreeNode[];
    }

    export interface MoodleCategoryTreeResponse {
      tree: MoodleCategoryTreeNode[];
      fetchedAt: string;
      totalCategories: number;
    }

    export interface MoodleCoursePreview {
      id: number;
      shortname: string;
      fullname: string;
      /** May be 0 or absent depending on Moodle version/master key permissions */
      enrolledusercount?: number;
      /** 0=hidden, 1=visible (Moodle convention) */
      visible: number;
      startdate: number;
      enddate: number;
    }

    export interface MoodleCategoryCoursesResponse {
      categoryId: number;
      courses: MoodleCoursePreview[];
    }
    ```

  - Notes: `categoryName` is intentionally absent from the API response — the frontend already has it from the tree data. Add JSDoc on `visible` fields: `/** 0=hidden, 1=visible (Moodle convention) */`

#### Phase 6: Frontend — Query Hooks (depends on Phase 5)

- [x] Task 10: Create tree query hook
  - File: `admin.faculytics/src/features/moodle-provision/use-moodle-tree.ts` [NEW]
  - Action: Export `useMoodleTree()` hook:
    ```typescript
    export function useMoodleTree() {
      const activeEnvId = useEnvStore((s) => s.activeEnvId);
      const isAuth = useAuthStore((s) =>
        activeEnvId ? s.isAuthenticated(activeEnvId) : false,
      );
      return useQuery<MoodleCategoryTreeResponse>({
        queryKey: ['moodle-tree', activeEnvId],
        queryFn: () =>
          apiClient<MoodleCategoryTreeResponse>('/moodle/provision/tree'),
        staleTime: 3 * 60 * 1000, // 3 minutes
        enabled: !!activeEnvId && isAuth,
      });
    }
    ```
  - Notes: `staleTime: 3 minutes` matches party mode decision. No `refetchInterval` — manual refresh via `refetch()`. `isAuth` guard prevents unauthenticated requests (matches existing hook pattern, e.g., `useSyncHistory`).

- [x] Task 11: Create category courses query hook
  - File: `admin.faculytics/src/features/moodle-provision/use-category-courses.ts` [NEW]
  - Action: Export `useCategoryCourses(categoryId)` hook:

    ```typescript
    import { keepPreviousData } from '@tanstack/react-query';

    export function useCategoryCourses(categoryId: number | null) {
      const activeEnvId = useEnvStore((s) => s.activeEnvId);
      const isAuth = useAuthStore((s) =>
        activeEnvId ? s.isAuthenticated(activeEnvId) : false,
      );
      return useQuery<MoodleCategoryCoursesResponse>({
        queryKey: ['moodle-tree', 'courses', activeEnvId, categoryId],
        queryFn: () =>
          apiClient<MoodleCategoryCoursesResponse>(
            `/moodle/provision/tree/${categoryId}/courses`,
          ),
        staleTime: 3 * 60 * 1000,
        enabled: !!activeEnvId && isAuth && categoryId !== null,
        placeholderData: keepPreviousData,
      });
    }
    ```

  - Notes: `enabled` guards against null categoryId and unauthenticated state. `placeholderData: keepPreviousData` shows previous category's courses while new one loads, preventing loading flicker on rapid clicks. Query key shares `'moodle-tree'` prefix with the tree hook for coherent invalidation. Leading slash on path matches existing hook conventions. **Version note:** `keepPreviousData` as an imported function requires TanStack Query v5+. Verify with `bun list @tanstack/react-query`. If on v4, use `keepPreviousData: true` (boolean option) instead.

#### Phase 7: Frontend — Tree Components (depends on Phase 6)

- [x] Task 12: Create recursive tree node component
  - File: `admin.faculytics/src/features/moodle-provision/components/category-tree-node.tsx` [NEW]
  - Action: Create `CategoryTreeNode` component:
    - Props: `node: MoodleCategoryTreeNode`, `onSelectCategory: (id: number, name: string) => void`, `defaultExpanded?: boolean`, `matchingIds?: Set<number>`, `ancestorIds?: Set<number>`
    - Uses shadcn `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent`
    - Display: chevron icon (rotates on expand) + folder/category icon by depth + `node.name` + `Badge` with `coursecount` if > 0
    - Click on node name text: calls `onSelectCategory(node.id, node.name)` to navigate to course list
    - Separate small clipboard icon button beside the name: calls `navigator.clipboard.writeText(node.name)` with toast "Copied to clipboard". These are two distinct click targets — name navigates, icon copies.
    - Recursively renders `CategoryTreeNode` for each child in `node.children`
    - Depth visual indicators: indent via `style={{ paddingLeft: node.depth * 16 }}` (inline style — Tailwind JIT cannot detect dynamic class names like `pl-${n}`, so use inline style for computed values). Use different icons per depth: `{ 1: Building, 2: Calendar, 3: Briefcase, 4: GraduationCap }` from Lucide. Use `FolderOpen` as fallback for `depth >= 5` (`const Icon = depthIcons[node.depth] ?? FolderOpen`)
    - Dim styling if `node.visible === 0` (hidden category)
    - **Accessibility:** Add `role="treeitem"` on each node container. Add `aria-expanded={isOpen}` on collapsible nodes. Radix `Collapsible` handles Enter/Space toggle natively.
  - Notes: Recursive component. Keep it simple — no virtualization needed for 200-500 nodes. The root container in the parent (Sheet) should have `role="tree"`.

- [x] Task 13: Create course list component
  - File: `admin.faculytics/src/features/moodle-provision/components/category-course-list.tsx` [NEW]
  - Action: Create `CategoryCourseList` component:
    - Props: `categoryId: number | null`, `categoryName: string`, `onBack: () => void`
    - Uses `useCategoryCourses(categoryId)` hook
    - Loading state: `Loader2` spinner
    - Empty state: "No courses in this category" message
    - Data state: table/list of courses with columns:
      - `shortname` (monospace text)
      - `fullname`
      - `enrolledusercount` (number badge when `> 0`, show "—" when falsy/absent — availability depends on Moodle version and master key permissions)
      - Visibility indicator (Eye/EyeOff icon)
      - `id` with click-to-copy button (small copy icon, toast "Course ID copied")
    - Each row: hover shows `Tooltip` with start/end dates formatted as readable dates (convert unix timestamp)
    - Header shows `categoryName` (from prop, not API response) + back button to return to tree view
  - Notes: Uses `ScrollArea` for the list if it overflows.

- [x] Task 14: Create main Sheet wrapper component
  - File: `admin.faculytics/src/features/moodle-provision/components/moodle-tree-sheet.tsx` [NEW]
  - Action: Create `MoodleTreeSheet` component:
    - Props: `open: boolean`, `onOpenChange: (open: boolean) => void`
    - Internal state:
      - `selectedCategoryId: number | null` — toggles between tree view and course list view
      - `selectedCategoryName: string` — name of selected category (passed to `CategoryCourseList` as prop)
      - `expandedIds: Set<number>` — manually expanded/collapsed node IDs
      - `searchTerm: string` — filter input value
    - Uses `useMoodleTree()` hook for tree data
    - Sheet layout:
      - `SheetHeader`: Title "Moodle Categories" + refresh button (`RefreshCw` icon, calls `refetch()`) + "Last fetched" relative timestamp from `fetchedAt` + total category count badge
      - `SheetContent` (side="right", `className="w-[480px] sm:w-[540px]"`):
        - When `selectedCategoryId === null`: render tree view with `ScrollArea` (add `role="tree"` on root container) containing recursive `CategoryTreeNode` for each root node
        - When `selectedCategoryId !== null`: render `CategoryCourseList` with `categoryName={selectedCategoryName}` and back button that resets `selectedCategoryId` to null
      - Search/filter: `Input` at top of tree view with `searchTerm` state
    - **Search/filter algorithm** (compute via `useMemo` from tree data + `searchTerm`):
      1. Build search index with a recursive helper function:
         ```typescript
         function buildSearchIndex(
           nodes: MoodleCategoryTreeNode[],
           parentId: number | null,
           index: {
             parentMap: Map<number, number | null>;
             allNodes: MoodleCategoryTreeNode[];
           },
         ) {
           for (const node of nodes) {
             index.parentMap.set(node.id, parentId);
             index.allNodes.push(node);
             buildSearchIndex(node.children, node.id, index);
           }
         }
         ```
         This walks the nested tree once and produces: `parentMap` (node.id → parent node.id) for ancestor walking, and `allNodes` flat list for filtering.
      2. Filter `allNodes`: if `node.name.toLowerCase().includes(searchTerm.toLowerCase())`, add `node.id` to `matchingIds: Set<number>`
      3. For each matching node, walk up `parentMap` chain, adding each ancestor ID to `ancestorIds: Set<number>`
      4. Pass `matchingIds` and `ancestorIds` to `CategoryTreeNode` as props
      5. A node is **visible** when: no search active (`searchTerm === ''`), OR node is in `matchingIds` or `ancestorIds`
      6. A node is **force-expanded** when: it is in `ancestorIds` (overrides `expandedIds` state during search)
      7. When `searchTerm` is cleared, revert to manual `expandedIds` state
    - `onSelectCategory` callback: `(id: number, name: string) => { setSelectedCategoryId(id); setSelectedCategoryName(name); }`
    - Loading state: skeleton or centered `Loader2`
    - Empty state: when `data && data.tree.length === 0` → centered "No categories found in Moodle" message (checked after loading, before tree render)
    - Error state: destructure `error` from `useMoodleTree()` query result. Check `error instanceof ApiError && (error.status === 502 || error.status === 503)` → "Failed to connect to Moodle" with retry button (`refetch()`). Both 502 (connectivity) and 503 (Moodle error) show the same user-facing message. TanStack Query types `error` as `Error | null` — `ApiError extends Error` so `instanceof` works directly.
  - Notes: The Sheet is a controlled component — parent (`ProvisionPage`) manages `open` state. Internal view switching between tree and course list via `selectedCategoryId`. Import `ApiError` from `@/lib/api-client` for error type checking (`error instanceof ApiError`).

#### Phase 8: Frontend — Integration (depends on Phase 7)

- [x] Task 15: Mount Sheet in ProvisionPage (shared across all tabs)
  - File: `admin.faculytics/src/features/moodle-provision/provision-page.tsx`
  - Action:
    1. Add state: `const [treeOpen, setTreeOpen] = useState(false)`
    2. Create callback: `const onBrowse = () => setTreeOpen(true)`
    3. Add `<MoodleTreeSheet open={treeOpen} onOpenChange={setTreeOpen} />` at the end of the component JSX (outside `Tabs` but inside the page wrapper)
    4. Pass `onBrowse` as a prop to each tab component: `<CategoriesTab onBrowse={onBrowse} />`, `<CoursesBulkTab onBrowse={onBrowse} />`, `<QuickCourseTab onBrowse={onBrowse} />`
  - Notes: Single Sheet instance shared across all tabs. One query, one component tree, one expanded state preserved across tab switches.

- [x] Task 16: Add browse button to categories tab
  - File: `admin.faculytics/src/features/moodle-provision/components/categories-tab.tsx`
  - Action:
    1. Add props interface and update function signature:
       ```typescript
       interface CategoriesTabProps { onBrowse: () => void }
       export function CategoriesTab({ onBrowse }: CategoriesTabProps) {
       ```
    2. Add a "Browse existing categories" button after the departments section, before the submit button. Use `Button variant="outline"` with `FolderTree` icon from Lucide. `onClick={onBrowse}`
  - Notes: No local Sheet state — just a button calling the parent's callback.

- [x] Task 17: Add browse button to courses bulk tab
  - File: `admin.faculytics/src/features/moodle-provision/components/courses-bulk-tab.tsx`
  - Action:
    1. Add props interface and update function signature:
       ```typescript
       interface CoursesBulkTabProps { onBrowse: () => void }
       export function CoursesBulkTab({ onBrowse }: CoursesBulkTabProps) {
       ```
    2. Add a "Browse existing" button in the upload view, next to or below the CSV drop zone. Use `Button variant="outline" size="sm"` with `FolderTree` icon. `onClick={onBrowse}`
  - Notes: Only visible in the `upload` view, not the `preview` view.

- [x] Task 18: Add browse button to quick course tab
  - File: `admin.faculytics/src/features/moodle-provision/components/quick-course-tab.tsx`
  - Action:
    1. Add props interface and update function signature:
       ```typescript
       interface QuickCourseTabProps { onBrowse: () => void }
       export function QuickCourseTab({ onBrowse }: QuickCourseTabProps) {
       ```
    2. Add a "Browse existing" button after the program input field. Use `Button variant="outline" size="sm"` with `FolderTree` icon. `onClick={onBrowse}`
  - Notes: `SeedUsersTab` intentionally does NOT receive `onBrowse` — browsing categories is not relevant when seeding users. Render it without props in `provision-page.tsx`: `<SeedUsersTab />`.

### Acceptance Criteria

#### Happy Path

- [x] AC 1: Given the admin is on any provision tab, when they click "Browse existing categories", then a Sheet slides in from the right showing the Moodle category tree with Campus nodes at the root level.

- [x] AC 2: Given the tree Sheet is open, when the admin expands a Campus node, then Semester children are shown indented beneath it, and further expansion reveals Department and Program levels.

- [x] AC 3: Given the tree is displayed, when the admin clicks a category node, then the view switches to a course list showing shortname, fullname, enrolled count (or "—" if unavailable), visibility, and Moodle ID for each course in that category.

- [x] AC 4: Given the course list is displayed, when the admin clicks the back button, then the view returns to the tree with the previously expanded state preserved.

- [x] AC 5: Given the tree is displayed, when the admin types in the search/filter input, then the tree filters to show only categories matching the search term (at any depth), with parent nodes auto-expanded to reveal matches.

- [x] AC 6: Given the tree Sheet is open, when the admin clicks the refresh button, then a fresh tree is fetched from Moodle and the "Last fetched" timestamp updates.

- [x] AC 7: Given any course or category node is displayed, when the admin clicks the copy icon beside a name or Moodle ID, then the value is copied to clipboard and a toast confirms "Copied to clipboard".

#### Error Handling

- [x] AC 8: Given the Moodle instance is unreachable, when the tree Sheet is opened, then the API returns HTTP 502 (Bad Gateway), and the frontend displays an error message "Failed to connect to Moodle" with a "Retry" button that calls `refetch()`.

- [x] AC 9: Given the admin is not authenticated as SUPER_ADMIN, when the tree API endpoint is called, then a 401 Unauthorized response is returned.

#### Edge Cases

- [x] AC 10: Given the Moodle instance has zero categories, when the tree is fetched, then an empty state message "No categories found in Moodle" is displayed.

- [x] AC 11: Given a category has zero courses, when the admin clicks it, then the course list shows "No courses in this category" message.

- [x] AC 12: Given a category has `visible === 0`, then it is rendered with dimmed/muted styling to visually distinguish it from visible categories.

- [x] AC 13: Given a course row is displayed, when the admin hovers over it, then a Tooltip shows the course start and end dates formatted as human-readable dates.

## Review Notes

- Adversarial review completed
- Findings: 10 total, 5 fixed, 1 acknowledged (tech debt), 4 skipped (noise)
- Resolution approach: auto-fix
- F1 (Medium): Sanitized error messages in controller to prevent internal detail leakage
- F2 (Low): Acknowledged — `@ApiBearerAuth()` inconsistency is known tech debt per spec
- F3 (Low): Added explicit nullish coalescing for `enrolledusercount` mapping
- F4 (Medium): Added error state with retry button to course list component
- F5 (Low): Added state reset on sheet close via useEffect
- F6 (Low): Added promise-based clipboard write with error toast fallback

## Additional Context

### Dependencies

**API:**

- No new npm packages — uses existing `MoodleClient`, `class-validator`, `@nestjs/swagger`
- Requires valid `MOODLE_BASE_URL` and `MOODLE_MASTER_KEY` env vars (already configured)

**Admin Frontend:**

- Install shadcn Collapsible: `bunx shadcn add collapsible` (Radix UI primitive for tree expand/collapse)
- No other new dependencies — uses existing Sheet, ScrollArea, Tooltip, TanStack Query

**Cross-Repo:**

- API must be deployed/running with new endpoints before frontend can use them
- Frontend type definitions must match API response DTOs

### Testing Strategy

**API Unit Tests (Task 7):**

- `GetCategoryTree()`: Mock `MoodleService.GetCategoriesWithMasterKey()` with flat fixture data across 4 depths with varying sortorder values. Assert correct nesting, sortorder-based child ordering, field mapping (only 6 fields per node — no sortorder in output), totalCategories count, fetchedAt format. Test empty array edge case.
- `GetCoursesByCategoryWithMasterKey()`: Mock course fetch to return fixture data. Assert field mapping (only 7 fields), no `categoryName` in response, `categoryId` echoed back.

**Manual Testing:**

- Open admin console → Moodle Provision → any tab → click "Browse existing categories"
- Verify tree loads with real Moodle data, expand/collapse works at all 4 levels
- Click a program-level category with courses → verify course list renders
- Click back → verify tree state is preserved
- Type in search → verify filtering with parent auto-expansion
- Click refresh → verify timestamp updates
- Click-to-copy on IDs and names → verify clipboard + toast
- Test with Moodle offline → verify error state and retry
- Test with empty Moodle instance → verify empty state

**No frontend automated tests** — admin.faculytics has no test infrastructure. Manual testing against real Moodle instance is the validation path.

### Notes

- The `MoodleController` (separate from `MoodleProvisioningController`) has `POST /moodle/get-course-categories` but it requires a user token. The new tree endpoints go on the provisioning controller and use the master key — keeping admin operations token-free.
- Tree construction from flat categories is O(n) using a Map keyed by `id` — straightforward implementation.
- Moodle `getCategories()` returns ALL categories in one call (no pagination). For typical Faculytics instances (200-500 categories), this is sub-second.
