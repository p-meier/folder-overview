import { useState, type FormEvent } from "react";

interface Props {
  initialValue: string;
  disabled: boolean;
  onSubmit: (path: string) => void;
}

export function PathInput({ initialValue, disabled, onSubmit }: Props) {
  const [value, setValue] = useState(initialValue);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    onSubmit(value.trim());
  };

  return (
    <form className="path-input" onSubmit={handleSubmit}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="z. B. /Users/you/Dropbox or ~/Dropbox"
        spellCheck={false}
        disabled={disabled}
        autoFocus
      />
      <button type="submit" disabled={disabled || !value.trim()}>
        {disabled ? "Scanning…" : "Scan"}
      </button>
    </form>
  );
}
