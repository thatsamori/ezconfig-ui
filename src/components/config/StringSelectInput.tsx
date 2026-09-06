"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface StringSelectInputProps {
  value: string;
  choices: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * Fixed-choice input for String config entries.
 * The choice names are the contract with the mod (ADR 0003); a value that is
 * not in the list (an old preset, say) is still shown so it can be replaced.
 */
export function StringSelectInput({
  value,
  choices,
  onChange,
  disabled,
}: StringSelectInputProps) {
  const options = choices.includes(value) ? choices : [value, ...choices];

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((choice) => (
          <SelectItem key={choice} value={choice}>
            {choice}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
