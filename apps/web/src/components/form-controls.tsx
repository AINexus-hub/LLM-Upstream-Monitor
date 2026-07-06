type CheckboxInputProps = {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}

export function CheckboxInput({ checked, label, onChange }: CheckboxInputProps) {
  return (
    <label className="flex items-center gap-3 border border-border bg-background/45 px-3 py-2 text-sm font-medium">
      <input
        checked={checked}
        className="size-4 accent-primary"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      {label}
    </label>
  )
}

type SelectInputProps = {
  label: string
  onChange: (value: string) => void
  options: Array<{ label: string; value: string }>
  value: string
}

export function SelectInput({ label, onChange, options, value }: SelectInputProps) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <select
        className="h-10 border border-input bg-background/75 px-3 text-sm outline-none focus:border-primary"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
