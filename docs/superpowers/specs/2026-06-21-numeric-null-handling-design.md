# Numeric null handling in the viewer

**Date:** 2026-06-21
**Status:** Approved, pending implementation plan

## Problem

The Python build already serializes a missing/non-finite numeric value as JSON
`null` (`_coerce` in `src/pview/__init__.py`), and numeric facet ranges already
drop NaN/±inf (`facets.py`). The viewer, however, treats null numeric values
inconsistently:

- **Filter** (`core/filter.ts`) explicitly rejects null/`''`/`undefined` from a
  numeric range — correct, but there is no way to opt back in.
- **Histogram** (`core/layout/histogram.ts`) coerces with `Number(value)` and
  only skips `NaN`. Because `Number(null) === 0` and `Number('') === 0`, null
  items are silently dropped into the bucket containing 0 (or clamped to the
  first/last bar). This disagrees with the filter: the same null item is
  excluded by the range filter but counted in the histogram.
- **Sort** (`core/sort.ts`) detects "bad" values via `Number.isNaN`, but
  `Number(null) === 0`, so null values sort as 0 rather than to the end.

## Goal

Give nulls consistent, intentional treatment across the three numeric views:

1. **Filter** — a per-facet toggle to include or exclude null items from a range
   constraint.
2. **Histogram** — a dedicated `null` bucket for missing values.
3. **Sort** — null values sort to the end regardless of direction.

## Scope

Numeric facets only. Date and category facets keep their current behavior
(their nulls are already dropped from ranges and value lists). Extending the
same treatment to date/category is a possible follow-up, not part of this work.

No change to the Python side or the bundle format (stays version 2). The viewer
derives everything it needs from the existing `items` data.

## Design decisions

- **Filter default:** when a range constraint is active, nulls are **excluded**
  by default (matches current behavior); the toggle opts them back in.
- **Null bucket position:** **last** (rightmost), after the numeric buckets.
- **Visibility:** the toggle and the null bucket appear **only when the facet
  actually has null values**.

## Components

### Null detection (shared)

Compute, once at load, the set of facet names that have at least one null/empty
value across `items`. A value counts as null when it is `null`, `undefined`, or
`''`. This `Set<string>` (call it `facetsWithNull`) is derived in the viewer
(e.g. in `App` / state setup) and passed to the sidebar and histogram. No bundle
or Python change.

Rationale: the viewer can derive this trivially from data it already has;
emitting a `hasNull` flag from `facets.py` would cost a bundle-contract change
for no added value.

### 1. Filtering (`core/filter.ts`, `ui/Sidebar.tsx`, state types)

Extend the numeric `RangeConstraint` with an optional field:

```ts
type RangeConstraint = { min: number; max: number; includeNull?: boolean } | { min: string; max: string }
```

In `passesConstraint`, numeric branch:

```ts
if (value === null || value === undefined || value === '') return constraint.includeNull === true
```

(The finite-range check below it is unchanged.)

In `NumericFilter` (`Sidebar.tsx`), when the facet is in `facetsWithNull`, render
a checkbox **"Include items with no value"** beneath the `RangeSlider`, default
**unchecked**. Toggling it writes `includeNull` onto the facet's constraint,
creating a full-range constraint (`{min: facet.min, max: facet.max,
includeNull: true}`) if none exists yet. The slider's existing `onChange`
preserves the current `includeNull` value when it writes min/max.

Resulting semantics:

| State | Behavior |
|-------|----------|
| No constraint | Nothing filtered; all items show (incl. nulls) — unchanged |
| Range narrowed, toggle off | Nulls excluded (today's behavior) |
| Range narrowed, toggle on | In-range items **and** null items show |

Faceted counts (`core/counts.ts`) already evaluate through `passesConstraint`,
so sidebar counts stay correct with no extra work.

### 2. Histogram (`core/layout/histogram.ts`)

In the numeric branch, when the facet is in `facetsWithNull`, append one bar
labeled `"null"` after the computed numeric bucket labels (so it is the
rightmost bar). The numeric `indexOf` becomes:

- `null` / `undefined` / `''` → the null bucket index (`barLabels.length - 1`)
- a finite number → its `bucketIndexOf` bucket (unchanged)
- any other non-finite / `NaN` → `-1` (skipped, unchanged)

When the facet has no nulls, no extra bar is added and behavior is identical to
today. The bar's count, `x`, and layout fall out of the existing
`heights`/`barLabels` loop — the null bucket is just one more entry.

Date and category branches are untouched.

### 3. Sort (`core/sort.ts`)

Replace the `Number.isNaN`-only "bad value" detection in the numeric comparator
with an explicit null/empty check before coercion:

```ts
const bad = (x: unknown) =>
  x === null || x === undefined || x === '' || Number.isNaN(Number(x))
const aBad = bad(a)
const bBad = bad(b)
if (aBad || bBad) return aBad && bBad ? 0 : aBad ? 1 : -1
return sign * (Number(a) - Number(b))
```

Because `sign` is not applied to the bad-value branch, nulls sort to the **end**
in both ascending and descending order. No UI change.

## Testing

- `filter.test.ts` — null item excluded by default under an active range;
  included when `includeNull: true`; unaffected when no constraint.
- `counts.test.ts` — counts reflect the toggle (consistency with the filter).
- `histogram.test.ts` — null items land in the `null` bucket (currently
  untested); no `null` bar when the facet has no nulls; null bar is last.
- `sort.test.ts` — null sorts to the end in both directions; ties among nulls
  are stable/zero.
- `Sidebar.test.tsx` / `RangeSlider.test.tsx` — toggle renders only when the
  facet has nulls; toggling updates the constraint.

## Build / bundle

After viewer changes, rebuild the `viewer_assets` bundle that the Python package
ships (per `local-viewer-visual-check` memory). The bundle format and Python
code are otherwise unchanged.
