# Null handling for filterable facets in the viewer

**Date:** 2026-06-21
**Status:** Approved, pending implementation plan

## Problem

The Python build serializes a missing/non-finite cell as JSON `null` (`_coerce`
in `src/pview/__init__.py`), and facet inference (`facets.py`) drops nulls from
numeric ranges, date ranges, and category value lists. The viewer, however,
treats null values inconsistently across its filterable facet types:

- **Filter** (`core/filter.ts`) rejects null/`''`/`undefined` from numeric and
  date ranges — correct, but with no way to opt back in. Category filtering
  silently excludes null items whenever any value is selected.
- **Histogram** (`core/layout/histogram.ts`) drops nulls inconsistently. For
  numeric facets it coerces with `Number(value)` and only skips `NaN`; since
  `Number(null) === 0`, null items are silently placed in the bucket containing
  0 (or clamped to an end bar). Date and category nulls fall out via `-1` and
  vanish entirely.
- **Sort** (`core/sort.ts`) only special-cases `NaN` in the numeric branch, and
  `Number(null) === 0`, so numeric nulls sort as 0. String/date/category nulls
  sort lexically as `"null"` among real values.

## Goal

Give nulls consistent, intentional treatment across every filterable facet type
(numeric, date, category) in all three views:

1. **Filter** — a per-facet way to include or exclude null items.
2. **Histogram** — a dedicated `null` bucket (rightmost) for missing values.
3. **Sort** — null values sort to the end regardless of direction.

Text facets are not filtered, bucketed, or (meaningfully) range-sorted, so they
need no change beyond null sorting to the end if ever sorted on.

## Scope

Numeric, date, and category facets. No change to the Python side or the bundle
format (stays version 2) — the viewer derives everything it needs from the
existing `items` data.

## Design decisions

- **Filter default:** nulls are **included** by default, even under an active
  constraint (range narrowed, or one or more categories selected); the user opts
  them *out* via the null control. `includeNull: false` is the explicit opt-out;
  absent/true means include. With no active constraint nothing is filtered and
  all items (including nulls) show. *(Updated 2026-06-21: the default was flipped
  from exclude to include after initial implementation.)*
- **Null bucket position:** **last** (rightmost), after the real buckets.
- **Visibility:** the null control and the null bucket appear **only when the
  facet actually has null values**.

## What counts as "missing"

A shared helper defines the base case:

```ts
const isMissing = (v: unknown) => v === null || v === undefined
```

- **Numeric / date** additionally treat `''` as missing (`''` is never a valid
  number or date, and the existing numeric filter already guards it because
  `Number('') === 0`).
- **Category** treats only `null`/`undefined` as missing. A genuine empty-string
  category survives Python's `astype(str)` as `""` in `facet.values`, so it must
  remain a selectable value rather than be folded into "no value".

## Components

### Null detection (shared)

Compute once at load the set of facet names that have ≥1 missing value across
`items`, using the per-type rule above. This `Set<string>` (`facetsWithNull`) is
derived in the viewer (state setup) and passed to the sidebar and histogram. No
bundle or Python change — the viewer derives it from data it already has.

### 1. Filtering (`core/filter.ts`, `ui/Sidebar.tsx`, state types)

**Constraint types.** Numeric and date range constraints gain an optional flag;
the category constraint becomes an object:

```ts
type RangeConstraint =
  | { min: number; max: number; includeNull?: boolean }
  | { min: string; max: string; includeNull?: boolean }
type CategoryConstraint = { values: Set<string>; includeNull?: boolean }
```

**`passesConstraint`:**

- Numeric / date: `if (isMissing(value) || value === '') return constraint.includeNull !== false` (range check below unchanged).
- Category: a missing item passes iff `constraint.includeNull !== false`; a
  present item passes iff `values.size === 0 || values.has(String(value))`. The
  "all pass when nothing selected" convention is preserved (a constraint is
  active when `values.size > 0 || includeNull === false`).

**Sidebar UI:**

- *Numeric / date* — when the facet is in `facetsWithNull`, render a checkbox
  **"Include items with no value"** beneath the slider, default **checked**.
  Toggling writes `includeNull` onto the constraint (flipping to the explicit
  `false` opt-out and back), creating a full-range constraint if none exists.
  The slider's `onChange` preserves the current `includeNull` when it writes
  min/max.
- *Category* — when the facet is in `facetsWithNull`, append a **"(no value)"**
  checkbox to the value list (with its own count, below), default **checked**.
  Unchecking it sets `includeNull: false`. Reads/writes go through the new object shape; existing
  value toggles update `constraint.values`.

Resulting semantics (uniform across all three types):

| State | Behavior |
|-------|----------|
| No active constraint | Nothing filtered; all items show (incl. nulls) |
| Active constraint, null control on (default) | In-range / selected items **and** nulls |
| Active constraint, null control off | Nulls excluded (`includeNull: false`) |

**Counts** (`core/counts.ts`). The category-count map gains a synthetic entry
for the "(no value)" row when the facet has nulls. Use a reserved sentinel key
`NULL_KEY` (a control-char-prefixed constant that real data won't produce) for
this entry only — the constraint itself uses the `includeNull` boolean, not the
sentinel. `bump` maps a missing category value to `NULL_KEY` instead of
`String(value)`, so the "(no value)" row shows a live count and stays consistent
with the filter. Faceted counts already evaluate through `passesConstraint`, so
the rest is automatic.

### 2. Histogram (`core/layout/histogram.ts`)

For numeric, date, **and** category facets, when the facet is in
`facetsWithNull`, append one bar labeled `"null"` after the real bucket labels
(rightmost). Each branch's `indexOf` maps a missing value (per the per-type
rule) to that last index; present values map as today:

- Numeric: missing → null bucket; finite number → `bucketIndexOf`; other
  non-finite → `-1` (skipped). Fixes the current `Number(null) === 0` bug.
- Date: missing → null bucket; otherwise `Date.parse` → `bucketIndexOf`.
- Category: missing → null bucket; otherwise `lut.get(String(value)) ?? -1`.

When a facet has no nulls, no extra bar is added and behavior is identical to
today. Count/x/layout fall out of the existing `barLabels`/`heights` loop.

### 3. Sort (`core/sort.ts`)

Push missing values to the end in both directions, for every facet type:

```ts
const numeric = facet?.type === 'numeric'
const bad = (x: unknown) =>
  x === null || x === undefined || x === '' || (numeric && Number.isNaN(Number(x)))
// in cmp:
const aBad = bad(a), bBad = bad(b)
if (aBad || bBad) return aBad && bBad ? 0 : aBad ? 1 : -1
// numeric: sign * (Number(a) - Number(b)); else: sign * String(a).localeCompare(String(b), undefined, { numeric: true })
```

`sign` is not applied to the bad-value branch, so nulls land at the end
regardless of `asc`/`desc`, matching the histogram/filter treatment. No UI
change.

## Testing

- `filter.test.ts` — for numeric, date, and category: null included by default
  under an active constraint; excluded when the null control is turned off
  (`includeNull: false`); unaffected when no constraint.
- `counts.test.ts` — category counts reflect the null control; the `NULL_KEY`
  row reports the right count; consistency with the filter.
- `histogram.test.ts` — null items land in the `null` bucket for all three types
  (currently untested for any); no `null` bar when the facet has none; null bar
  is last.
- `sort.test.ts` — null sorts to the end in both directions for numeric and
  string-valued (date/category) facets; ties among nulls are stable.
- `Sidebar.test.tsx` / `RangeSlider.test.tsx` — null control renders only when
  the facet has nulls; toggling updates the constraint for each type.

## Build / bundle

After viewer changes, rebuild the `viewer_assets` bundle the Python package
ships (per the `local-viewer-visual-check` note). The bundle format and Python
code are otherwise unchanged.
