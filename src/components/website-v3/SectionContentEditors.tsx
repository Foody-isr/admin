"use client";

import { useRef, useState } from "react";
import {
  AboutBlocksEditor,
  ActionButtonsEditor,
  MenuHighlightsEditor,
  PicnicBasketEditor,
} from "@/components/website/SectionEditors";
import { uploadSectionImage, uploadSectionVideo } from "@/lib/api";
import type { DraftSectionPayload, StatePath } from "@/lib/website-v3/types";
import { InspectorField, controlClass } from "./controls";

type SectionContentEditorsProps = {
  restaurantId: number;
  section: DraftSectionPayload;
  onChange: (path: StatePath, value: unknown) => void;
};

/** Builds one atomic Hero update so image, focal point, video, and legacy state cannot overwrite each other. */
export function heroImageReplacement(
  section: DraftSectionPayload,
  imageUrl: string,
): DraftSectionPayload {
  return {
    ...section,
    content: {
      ...section.content,
      image_url: imageUrl,
      video_url: "",
      image_focal_x: 50,
      image_focal_y: 50,
    },
    settings: text(section.settings.bg_image)
      ? { ...section.settings, bg_image: "" }
      : section.settings,
  };
}

/** Renders the editable content model for every V3 content section. */
export function SectionContentEditors({
  restaurantId,
  section,
  onChange,
}: SectionContentEditorsProps) {
  const updateContent = (key: string, value: unknown) =>
    onChange(["content", key], value);
  const updateSettings = (key: string, value: unknown) =>
    onChange(["settings", key], value);

  switch (section.section_type) {
    case "hero_banner":
      return (
        <HeroEditor
          restaurantId={restaurantId}
          section={section}
          onChange={onChange}
        />
      );
    case "gallery":
      return (
        <GalleryEditor
          restaurantId={restaurantId}
          images={imageList(section.content.images)}
          onChange={(images) => updateContent("images", images)}
        />
      );
    case "feature_cards":
      return (
        <FeatureCardsEditor
          restaurantId={restaurantId}
          cards={recordList(section.content.cards)}
          onChange={(cards) => updateContent("cards", cards)}
        />
      );
    case "about":
      return (
        <AboutBlocksEditor
          restaurantId={restaurantId}
          content={section.content}
          updateContent={updateContent}
        />
      );
    case "menu_highlights":
      return (
        <MenuHighlightsEditor
          restaurantId={restaurantId}
          content={section.content}
          settings={section.settings}
          updateContent={updateContent}
          updateSettings={updateSettings}
        />
      );
    case "picnic_basket":
      return (
        <PicnicBasketEditor
          restaurantId={restaurantId}
          content={section.content}
          settings={section.settings}
          updateContent={updateContent}
          updateSettings={updateSettings}
        />
      );
    case "action_buttons":
      return (
        <ActionButtonsEditor
          content={section.content}
          updateContent={updateContent}
        />
      );
    case "testimonials":
      return (
        <TestimonialsEditor
          reviews={recordList(section.content.reviews)}
          onChange={(reviews) => updateContent("reviews", reviews)}
        />
      );
    case "social_feed":
      return (
        <SocialLinksEditor
          links={recordList(section.content.links)}
          onChange={(links) => updateContent("links", links)}
        />
      );
    case "text_and_image":
    case "promo_banner":
      return (
        <>
          <TextField
            fieldId="section.content.title"
            label="Titre"
            value={text(section.content.title)}
            onChange={(value) => updateContent("title", value)}
          />
          <TextField
            fieldId="section.content.body"
            label="Texte"
            value={text(section.content.body)}
            onChange={(value) => updateContent("body", value)}
            multiline
          />
          <ImageUploadField
            restaurantId={restaurantId}
            label="Image"
            fieldId="section.content.image_url"
            currentUrl={text(section.content.image_url)}
            onUploaded={(url) => updateContent("image_url", url)}
            onRemove={() => updateContent("image_url", "")}
          />
        </>
      );
    case "scrolling_text":
      return (
        <TextField
          fieldId="section.content.text"
          label="Texte défilant"
          value={text(section.content.text)}
          onChange={(value) => updateContent("text", value)}
          multiline
        />
      );
    case "footer":
      return (
        <TextField
          fieldId="section.content.custom_text"
          label="Texte du pied de page"
          value={text(section.content.custom_text)}
          onChange={(value) => updateContent("custom_text", value)}
        />
      );
    default:
      return (
        <p className="rounded-xl bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-800">
          Ce composant n’a pas encore de contenu configurable.
        </p>
      );
  }
}

function HeroEditor({
  restaurantId,
  section,
  onChange,
}: SectionContentEditorsProps) {
  const content = section.content;
  const settings = section.settings;
  const contentImage = text(content.image_url);
  const legacyBackgroundImage = text(settings.bg_image);
  const currentImage = contentImage || legacyBackgroundImage;
  const currentVideo = text(content.video_url);

  function updateContent(key: string, value: unknown) {
    onChange(["content", key], value);
  }

  function replaceImage(url: string) {
    onChange([], heroImageReplacement(section, url));
  }

  function removeImage() {
    onChange([], {
      ...section,
      content: { ...content, image_url: "" },
      settings: legacyBackgroundImage
        ? { ...settings, bg_image: "" }
        : settings,
    });
  }

  return (
    <>
      <TextField
        fieldId="section.content.headline"
        label="Titre"
        value={text(content.headline)}
        onChange={(value) => updateContent("headline", value)}
      />
      <TextField
        fieldId="section.content.subheadline"
        label="Sous-titre"
        value={text(content.subheadline)}
        onChange={(value) => updateContent("subheadline", value)}
        multiline
      />
      <TextField
        fieldId="section.content.cta_text"
        label="Texte du bouton"
        value={text(content.cta_text)}
        onChange={(value) => updateContent("cta_text", value)}
        placeholder="Commander"
      />
      <TextField
        fieldId="section.content.cta_link"
        label="Lien du bouton"
        value={text(content.cta_link)}
        onChange={(value) => updateContent("cta_link", value)}
        placeholder="/order, /catering ou https://…"
      />
      <ImageUploadField
        restaurantId={restaurantId}
        label="Image principale"
        fieldId="section.content.image_url"
        currentUrl={currentImage}
        onUploaded={replaceImage}
        onRemove={removeImage}
      />
      <VideoUploadField
        restaurantId={restaurantId}
        currentUrl={currentVideo}
        posterUrl={currentImage}
        onUploaded={(url) => updateContent("video_url", url)}
        onRemove={() => updateContent("video_url", "")}
      />
      {currentVideo ? (
        <p className="-mt-2 text-[11px] leading-4 text-slate-500">
          Ajouter ou remplacer l’image réactive la couverture image à la place
          de la vidéo.
        </p>
      ) : null}
      {legacyBackgroundImage && !contentImage ? (
        <p className="-mt-2 text-[11px] leading-4 text-slate-500">
          Cette image provient de l’ancienne configuration. Elle sera
          automatiquement convertie lors de son remplacement.
        </p>
      ) : null}
    </>
  );
}

function VideoUploadField({
  restaurantId,
  currentUrl,
  posterUrl,
  onUploaded,
  onRemove,
}: {
  restaurantId: number;
  currentUrl: string;
  posterUrl: string;
  onUploaded: (url: string) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      setError("La vidéo ne doit pas dépasser 50 Mo.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      onUploaded(await uploadSectionVideo(restaurantId, file));
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Le téléversement a échoué.",
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-semibold text-slate-600">Vidéo de couverture</p>
        <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
          MP4 ou WebM, 50 Mo maximum. La vidéo sera muette et jouée en boucle.
        </p>
      </div>
      {currentUrl ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
          <video
            src={currentUrl}
            poster={posterUrl || undefined}
            muted
            loop
            playsInline
            controls
            className="max-h-44 w-full object-cover"
          />
          <div className="flex gap-2 bg-white p-2">
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {uploading ? "Téléversement…" : "Remplacer"}
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600"
            >
              Supprimer
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="w-full rounded-xl border-2 border-dashed border-slate-200 px-3 py-6 text-sm font-semibold text-slate-600 hover:border-[#315fce] hover:text-[#315fce] disabled:opacity-50"
        >
          {uploading ? "Téléversement…" : "Ajouter une vidéo"}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/webm"
        onChange={(event) => void upload(event.target.files?.[0])}
        className="hidden"
      />
      <input
        type="url"
        data-field-id="section.content.video_url"
        value={currentUrl}
        onChange={(event) => onUploaded(event.target.value)}
        className={controlClass}
        placeholder="Ou collez l’URL de la vidéo"
      />
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

function GalleryEditor({
  restaurantId,
  images,
  onChange,
}: {
  restaurantId: number;
  images: Array<{ url: string; alt?: string }>;
  onChange: (images: Array<{ url: string; alt?: string }>) => void;
}) {
  return (
    <div className="space-y-3">
      {images.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {images.map((image, index) => (
            <div
              key={`${image.url}-${index}`}
              className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
            >
              <img
                src={image.url}
                alt={image.alt ?? ""}
                className="aspect-square w-full object-cover"
              />
              <div className="space-y-2 p-2">
                <input
                  aria-label={`Texte alternatif ${index + 1}`}
                  value={image.alt ?? ""}
                  onChange={(event) =>
                    onChange(
                      images.map((candidate, candidateIndex) =>
                        candidateIndex === index
                          ? { ...candidate, alt: event.target.value }
                          : candidate,
                      ),
                    )
                  }
                  className={`${controlClass} min-h-8 px-2 text-xs`}
                  placeholder="Description de l’image"
                />
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => onChange(move(images, index, index - 1))}
                    className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:opacity-30"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onChange(images.filter((_, itemIndex) => itemIndex !== index))
                    }
                    className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600"
                  >
                    Supprimer
                  </button>
                  <button
                    type="button"
                    disabled={index === images.length - 1}
                    onClick={() => onChange(move(images, index, index + 1))}
                    className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:opacity-30"
                  >
                    →
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl bg-slate-50 px-3 py-3 text-xs text-slate-500">
          Aucune image pour le moment.
        </p>
      )}
      <MultiImageUpload
        restaurantId={restaurantId}
        onUploaded={(urls) =>
          onChange([...images, ...urls.map((url) => ({ url, alt: "" }))])
        }
      />
    </div>
  );
}

function FeatureCardsEditor({
  restaurantId,
  cards,
  onChange,
}: {
  restaurantId: number;
  cards: Array<Record<string, unknown>>;
  onChange: (cards: Array<Record<string, unknown>>) => void;
}) {
  function updateCard(index: number, key: string, value: unknown) {
    onChange(
      cards.map((card, cardIndex) =>
        cardIndex === index ? { ...card, [key]: value } : card,
      ),
    );
  }

  return (
    <div className="space-y-4">
      {cards.map((card, index) => (
        <div
          key={index}
          className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">
              Carte {index + 1}
            </span>
            <button
              type="button"
              onClick={() =>
                onChange(cards.filter((_, cardIndex) => cardIndex !== index))
              }
              className="text-xs font-medium text-red-600"
            >
              Supprimer
            </button>
          </div>
          <ImageUploadField
            restaurantId={restaurantId}
            label="Image"
            currentUrl={text(card.image_url)}
            onUploaded={(url) => updateCard(index, "image_url", url)}
            onRemove={() => updateCard(index, "image_url", "")}
          />
          <TextField
            label="Titre"
            value={text(card.title)}
            onChange={(value) => updateCard(index, "title", value)}
          />
          <TextField
            label="Sous-titre"
            value={text(card.subtitle)}
            onChange={(value) => updateCard(index, "subtitle", value)}
          />
          <TextField
            label="Lien"
            value={text(card.link)}
            onChange={(value) => updateCard(index, "link", value)}
            placeholder="/order, /catering ou https://…"
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange([
            ...cards,
            { image_url: "", title: "", subtitle: "", link: "" },
          ])
        }
        className="w-full rounded-xl border-2 border-dashed border-slate-200 px-3 py-3 text-sm font-semibold text-slate-600 hover:border-[#315fce] hover:text-[#315fce]"
      >
        + Ajouter une carte
      </button>
    </div>
  );
}

function TestimonialsEditor({
  reviews,
  onChange,
}: {
  reviews: Array<Record<string, unknown>>;
  onChange: (reviews: Array<Record<string, unknown>>) => void;
}) {
  function updateReview(index: number, key: string, value: unknown) {
    onChange(
      reviews.map((review, reviewIndex) =>
        reviewIndex === index ? { ...review, [key]: value } : review,
      ),
    );
  }

  return (
    <Repeater
      items={reviews}
      itemLabel="Avis"
      addLabel="Ajouter un avis"
      onAdd={() =>
        onChange([...reviews, { name: "", text: "", rating: 5 }])
      }
      onRemove={(index) =>
        onChange(reviews.filter((_, reviewIndex) => reviewIndex !== index))
      }
      renderItem={(review, index) => (
        <>
          <TextField
            label="Nom"
            value={text(review.name)}
            onChange={(value) => updateReview(index, "name", value)}
          />
          <TextField
            label="Avis"
            value={text(review.text)}
            onChange={(value) => updateReview(index, "text", value)}
            multiline
          />
          <InspectorField label="Note">
            <select
              value={number(review.rating, 5)}
              onChange={(event) =>
                updateReview(index, "rating", Number(event.target.value))
              }
              className={controlClass}
            >
              {[5, 4, 3, 2, 1].map((rating) => (
                <option key={rating} value={rating}>
                  {rating}/5
                </option>
              ))}
            </select>
          </InspectorField>
        </>
      )}
    />
  );
}

function SocialLinksEditor({
  links,
  onChange,
}: {
  links: Array<Record<string, unknown>>;
  onChange: (links: Array<Record<string, unknown>>) => void;
}) {
  return (
    <div className="space-y-3">
      {["instagram", "facebook", "tiktok"].map((platform) => {
        const existing = links.find((link) => link.platform === platform);
        return (
          <TextField
            key={platform}
            label={platform[0].toUpperCase() + platform.slice(1)}
            value={text(existing?.url)}
            onChange={(value) => {
              const withoutPlatform = links.filter(
                (link) => link.platform !== platform,
              );
              onChange(
                value
                  ? [...withoutPlatform, { platform, url: value }]
                  : withoutPlatform,
              );
            }}
            placeholder={`https://${platform}.com/…`}
          />
        );
      })}
    </div>
  );
}

function Repeater({
  items,
  itemLabel,
  addLabel,
  onAdd,
  onRemove,
  renderItem,
}: {
  items: Array<Record<string, unknown>>;
  itemLabel: string;
  addLabel: string;
  onAdd: () => void;
  onRemove: (index: number) => void;
  renderItem: (item: Record<string, unknown>, index: number) => React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      {items.map((item, index) => (
        <div
          key={index}
          className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">
              {itemLabel} {index + 1}
            </span>
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="text-xs font-medium text-red-600"
            >
              Supprimer
            </button>
          </div>
          {renderItem(item, index)}
        </div>
      ))}
      <button
        type="button"
        onClick={onAdd}
        className="w-full rounded-xl border-2 border-dashed border-slate-200 px-3 py-3 text-sm font-semibold text-slate-600 hover:border-[#315fce] hover:text-[#315fce]"
      >
        + {addLabel}
      </button>
    </div>
  );
}

function TextField({
  fieldId,
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  fieldId?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <InspectorField label={label}>
      {multiline ? (
        <textarea
          data-field-id={fieldId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`${controlClass} min-h-24 py-2.5`}
          placeholder={placeholder}
        />
      ) : (
        <input
          data-field-id={fieldId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={controlClass}
          placeholder={placeholder}
        />
      )}
    </InspectorField>
  );
}

function ImageUploadField({
  restaurantId,
  label,
  fieldId,
  currentUrl,
  onUploaded,
  onRemove,
}: {
  restaurantId: number;
  label: string;
  fieldId?: string;
  currentUrl: string;
  onUploaded: (url: string) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      onUploaded(await uploadSectionImage(restaurantId, file));
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Le téléversement a échoué.",
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-600">{label}</p>
      {currentUrl ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          <img
            src={currentUrl}
            alt=""
            className="max-h-44 w-full object-cover"
          />
          <div className="flex gap-2 p-2">
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {uploading ? "Téléversement…" : "Remplacer"}
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600"
            >
              Supprimer
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="w-full rounded-xl border-2 border-dashed border-slate-200 px-3 py-6 text-sm font-semibold text-slate-600 hover:border-[#315fce] hover:text-[#315fce] disabled:opacity-50"
        >
          {uploading ? "Téléversement…" : "Téléverser une image"}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={(event) => void upload(event.target.files?.[0])}
        className="hidden"
      />
      {fieldId ? (
        <input
          type="url"
          data-field-id={fieldId}
          value={currentUrl}
          onChange={(event) => onUploaded(event.target.value)}
          className={controlClass}
          placeholder="Ou collez l’URL de l’image"
        />
      ) : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

function MultiImageUpload({
  restaurantId,
  onUploaded,
}: {
  restaurantId: number;
  onUploaded: (urls: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        urls.push(await uploadSectionImage(restaurantId, file));
      }
      onUploaded(urls);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Le téléversement a échoué.",
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="w-full rounded-xl border-2 border-dashed border-slate-200 px-3 py-4 text-sm font-semibold text-slate-600 hover:border-[#315fce] hover:text-[#315fce] disabled:opacity-50"
      >
        {uploading ? "Téléversement…" : "+ Ajouter des images"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => void upload(event.target.files)}
        className="hidden"
      />
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

function imageList(value: unknown): Array<{ url: string; alt?: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const url = text(record.url);
    return url ? [{ url, alt: text(record.alt) }] : [];
  });
}

function recordList(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object",
      )
    : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function number(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
