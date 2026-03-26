import { Transform } from 'class-transformer';

/**
 * Transforms a string-typed boolean query/form parameter into a proper boolean.
 *
 * Three-state semantics:
 *  - `"true"`  → `true`
 *  - `"false"` → `false`
 *  - absent / `undefined` / `null` → `undefined`  (preserves optionality)
 *
 * Works for both `@Query()` and `@Body()` (multipart form) parameters
 * where values arrive as strings.
 */
export function BooleanQueryTransform() {
  return Transform(
    ({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
      const raw = obj[key];
      if (raw === undefined || raw === null) return undefined;
      if (typeof raw === 'string') return raw === 'true';
      return raw === true;
    },
  );
}
