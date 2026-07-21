import { PROVIDER_PRESETS } from './providerForm';

export function ProviderPresetPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-xs text-text-secondary">
      类型或预设
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm"
      >
        {PROVIDER_PRESETS.map(preset => (
          <option key={preset.id} value={preset.id}>
            {preset.label}
          </option>
        ))}
      </select>
    </label>
  );
}
