export function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div class="pview-empty">
      <p>No items match your filters.</p>
      <button type="button" onClick={onClear}>
        Clear all
      </button>
    </div>
  )
}
