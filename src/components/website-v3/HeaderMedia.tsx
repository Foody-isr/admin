"use client";
import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { uploadSectionImage } from "@/lib/api";
import type { HeaderCopy } from "./header-copy";

/** Uploads component media into the draft without mutating the restaurant's live logo. */
export function HeaderMedia({
  restaurantId,
  value,
  onChange,
  copy: c,
}: {
  restaurantId: number;
  value: string;
  onChange: (url: string) => void;
  copy: HeaderCopy;
}) {
  const input = useRef<HTMLInputElement>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  return (
    <div>
      <div className="sqh-media">
        {value ? <img src={value} alt="" /> : <ImagePlus size={28} />}
        <button disabled={busy} onClick={() => input.current?.click()}>
          {busy ? c.busy : value ? c.replace : c.upload}
        </button>
        {value && (
          <button
            aria-label={c.remove}
            disabled={busy}
            onClick={() => onChange("")}
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>
      <input
        ref={input}
        hidden
        type="file"
        accept="image/*"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          setError(false);
          try {
            onChange(await uploadSectionImage(restaurantId, file));
          } catch {
            setError(true);
          } finally {
            setBusy(false);
            if (input.current) input.current.value = "";
          }
        }}
      />
      {error && <p role="alert">{c.uploadError}</p>}
    </div>
  );
}
