"use client";
import { useState } from "react";
import type { MenuItem } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { ImageFramingControl } from "./ImageFramingControl";

/** Frames each catalogue photo for this website without changing the catalogue asset. */
export function ItemImageFramingEditor({
  items,
  value,
  onChange,
}: {
  items: MenuItem[];
  value: unknown;
  onChange: (value: Record<string, unknown>) => void;
}) {
  const { locale } = useI18n();
  const copy =
    locale === "fr"
      ? { title: "Cadrage des photos d’articles", item: "Article" }
      : locale === "he"
        ? { title: "מסגור תמונות פריטים", item: "פריט" }
        : { title: "Item photo framing", item: "Item" };
  const photos = items.filter((item) => item.image_url);
  const [selected, setSelected] = useState("");
  const item = photos.find((item) => String(item.id) === selected) || photos[0];
  const frames =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  if (!item) return null;
  return (
    <details className="sqe-item-image-frames">
      <summary>{copy.title}</summary>
      <label className="sqe-field">
        {copy.item}
        <select
          value={String(item.id)}
          onChange={(e) => setSelected(e.target.value)}
        >
          {photos.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <ImageFramingControl
        key={item.id}
        src={item.image_url || ""}
        value={frames[item.id]}
        desktopRatio={1}
        mobileRatio={1}
        onChange={(framing) => {
          const next = { ...frames };
          if (framing) next[item.id] = framing;
          else delete next[item.id];
          onChange(next);
        }}
      />
    </details>
  );
}
