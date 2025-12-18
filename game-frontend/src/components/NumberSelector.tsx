interface NumberSelectorProps {
  selected: number | null
  onSelect: (num: number | null) => void
  disabled?: boolean
}

export default function NumberSelector({
  selected,
  onSelect,
  disabled,
}: NumberSelectorProps) {
  const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

  return (
    <div className="grid grid-cols-5 gap-3 max-w-xs mx-auto">
      {numbers.map((num) => (
        <button
          key={num}
          onClick={() => onSelect(selected === num ? null : num)}
          disabled={disabled}
          className={`
            number-btn
            ${selected === num ? 'number-btn-selected' : ''}
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          {num}
        </button>
      ))}
    </div>
  )
}
