import { CURRENCY_CODES } from "@/lib/currencies";
import { inputClass } from "./ui";

export function CurrencySelect({
  name,
  defaultValue,
  value,
  onChange,
  className,
}: {
  name?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (code: string) => void;
  className?: string;
}) {
  return (
    <select
      name={name}
      defaultValue={value === undefined ? defaultValue : undefined}
      value={value}
      onChange={onChange && ((e) => onChange(e.target.value))}
      className={className ?? inputClass}
    >
      {CURRENCY_CODES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}
