"use client";
import { useState, type ReactNode } from "react";
import {
  GripVertical,
  MoreHorizontal,
  Plus,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  HeaderLink,
  HeaderTarget,
  headerSafeUrl,
} from "@/lib/website-v3/header";
import type {
  DraftPagePayload,
  DraftSectionPayload,
} from "@/lib/website-v3/types";
import { InspectorField, controlClass } from "./controls";
import type { HeaderCopy } from "./header-copy";

type Context = {
  copy: HeaderCopy;
  pages: DraftPagePayload[];
  sections: DraftSectionPayload[];
};
/** Edits a link transactionally so cancelling never modifies the draft. */
export function HeaderTargetDialog({
  copy: c,
  pages,
  sections,
  value,
  label,
  onSave,
  onClose,
  extra,
  onRemove,
}: Context & {
  value: HeaderTarget;
  label?: string;
  onSave: (target: HeaderTarget, label: string) => void;
  onClose: () => void;
  extra?: ReactNode;
  onRemove?: () => void;
}) {
  const [target, setTarget] = useState(value),
    [name, setName] = useState(label ?? ""),
    [error, setError] = useState(false);
  const page = pages.find((p) => p.slug === target.value);
  const pageSections = sections.filter(
    (s) =>
      page &&
      (page.id ? s.page_id === page.id : s.page_tmp_id === page.tmp_id) &&
      !["footer", "branding"].includes(s.section_type),
  );
  const valid =
    target.kind === "home" ||
    target.kind === "order" ||
    (target.kind === "page"
      ? pages.some((p) => p.slug === target.value)
      : target.kind === "phone"
        ? /^\+?[\d ()-]{3,}$/.test(target.value)
        : target.kind === "email"
          ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target.value)
          : Boolean(headerSafeUrl(target.value, target.kind === "file")));
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sqe-header-link-dialog">
        <DialogTitle>
          {onRemove || label === undefined ? c.edit : c.addLink}
        </DialogTitle>
        <DialogDescription className="sr-only">{c.target}</DialogDescription>
        {label !== undefined && (
          <InspectorField label={c.label}>
            <input
              autoFocus
              className={controlClass}
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
            />
          </InspectorField>
        )}
        <InspectorField label={c.target}>
          <select
            className={controlClass}
            value={target.kind}
            onChange={(e) => {
              setTarget({
                kind: e.target.value as HeaderTarget["kind"],
                value: e.target.value === "page" ? (pages[0]?.slug ?? "") : "",
                new_tab: target.new_tab,
              });
              setError(false);
            }}
          >
            {(
              [
                "home",
                "page",
                "order",
                "url",
                "phone",
                "email",
                "file",
              ] as const
            ).map((kind) => (
              <option key={kind} value={kind}>
                {c[kind]}
              </option>
            ))}
          </select>
        </InspectorField>
        {target.kind === "page" ? (
          <>
            <InspectorField label={c.page}>
              <select
                className={controlClass}
                value={target.value}
                onChange={(e) =>
                  setTarget({ ...target, value: e.target.value, anchor: "" })
                }
              >
                <option value="">—</option>
                {pages.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.title}
                  </option>
                ))}
              </select>
            </InspectorField>
            <InspectorField label={c.anchor}>
              <select
                className={controlClass}
                value={target.anchor ?? ""}
                onChange={(e) =>
                  setTarget({ ...target, anchor: e.target.value })
                }
              >
                <option value="">—</option>
                {pageSections.map((s) => {
                  const id = String(s.id ?? s.tmp_id);
                  return (
                    <option
                      key={id}
                      value={String(s.settings.anchor || `section-${id}`)}
                    >
                      {String(
                        s.content.title ?? s.content.headline ?? s.section_type,
                      )}
                    </option>
                  );
                })}
              </select>
            </InspectorField>
          </>
        ) : (
          ["url", "phone", "email", "file"].includes(target.kind) && (
            <InspectorField label={c[target.kind]}>
              <input
                className={controlClass}
                value={target.value}
                onChange={(e) =>
                  setTarget({ ...target, value: e.target.value })
                }
              />
            </InspectorField>
          )
        )}
        <label className="sqh-check selection-row">
          {c.newTab}
          <input
            type="checkbox"
            checked={target.new_tab ?? false}
            onChange={(e) =>
              setTarget({ ...target, new_tab: e.target.checked })
            }
          />
        </label>
        {extra}
        {error && <p role="alert">{c.invalidLink}</p>}
        {onRemove && (
          <button className="sqh-remove-link" onClick={onRemove}>
            {c.removeLink}
          </button>
        )}
        <div className="sqh-dialog-actions">
          <button className="sqe-button sqe-button-secondary" onClick={onClose}>
            {c.cancel}
          </button>
          <button
            className="sqe-button sqe-button-primary"
            onClick={() => {
              if (!valid || (label !== undefined && !name.trim())) {
                setError(true);
                return;
              }
              onSave(target, name.trim());
            }}
          >
            {c.save}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Orders navigation links and one level of sub-navigation used by dropdown and mega menus. */
export function HeaderLinksEditor({
  copy: c,
  pages,
  sections,
  value,
  onChange,
}: Context & { value: HeaderLink[]; onChange: (links: HeaderLink[]) => void }) {
  const [edit, setEdit] = useState<{
      link: HeaderLink;
      parent: string | null;
    } | null>(null),
    [drag, setDrag] = useState<string | null>(null);
  const flatten = value.flatMap((link) => [
    { link, parent: null as string | null },
    ...(link.children ?? []).map((child) => ({ link: child, parent: link.id })),
  ]);
  const save = (target: HeaderTarget, label: string) => {
    if (!edit) return;
    const entry = { ...edit.link, label, target };
    const flat = flatten.filter(({ link }) => link.id !== entry.id);
    const previous = flatten.findIndex(({ link }) => link.id === entry.id);
    flat.splice(previous < 0 ? flat.length : previous, 0, {
      link: entry,
      parent: edit.parent,
    });
    const roots = flat
      .filter((row) => !row.parent)
      .map((row) => ({
        ...row.link,
        children: flat
          .filter((child) => child.parent === row.link.id)
          .map((child) => ({ ...child.link, children: [] })),
      }));
    onChange(roots);
    setEdit(null);
  };
  const remove = (id: string) =>
    onChange(
      value
        .filter((l) => l.id !== id)
        .map((l) => ({
          ...l,
          children: l.children?.filter((child) => child.id !== id),
        })),
    );
  const move = (id: string, targetId: string) => {
    const from = flatten.find((row) => row.link.id === id),
      to = flatten.find((row) => row.link.id === targetId);
    if (!from || !to || from.parent !== to.parent) return;
    const reorder = (links: HeaderLink[]) => {
      const list = links.slice(),
        index = list.findIndex((l) => l.id === id),
        target = list.findIndex((l) => l.id === targetId);
      if (index < 0 || target < 0) return links;
      list.splice(target, 0, list.splice(index, 1)[0]);
      return list;
    };
    onChange(
      from.parent
        ? value.map((l) =>
            l.id === from.parent
              ? { ...l, children: reorder(l.children ?? []) }
              : l,
          )
        : reorder(value),
    );
  };
  return (
    <div className="sqh-link-list">
      <button
        className="sqe-button sqe-button-secondary w-full"
        onClick={() =>
          setEdit({
            link: {
              id: crypto.randomUUID(),
              label: "",
              target: { kind: "page", value: pages[0]?.slug ?? "" },
            },
            parent: null,
          })
        }
      >
        <Plus size={18} />
        {c.addLink}
      </button>
      <p>{c.arrange}</p>
      {flatten.map(({ link, parent }) => {
        const siblings = flatten.filter((row) => row.parent === parent);
        const index = siblings.findIndex((row) => row.link.id === link.id);
        return (
          <div
            key={link.id}
            className="sqh-link-row"
            data-child={Boolean(parent)}
            draggable
            onDragStart={() => setDrag(link.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (drag) move(drag, link.id);
              setDrag(null);
            }}
          >
            <GripVertical size={16} />
            <span>{link.label}</span>
            <button
              aria-label={`${c.moveUp} ${link.label}`}
              disabled={index === 0}
              onClick={() => move(link.id, siblings[index - 1].link.id)}
            >
              <ArrowUp size={15} />
            </button>
            <button
              aria-label={`${c.moveDown} ${link.label}`}
              disabled={index === siblings.length - 1}
              onClick={() => move(link.id, siblings[index + 1].link.id)}
            >
              <ArrowDown size={15} />
            </button>
            <button
              aria-label={`${c.edit} ${link.label}`}
              onClick={() => setEdit({ link, parent })}
            >
              <MoreHorizontal size={20} />
            </button>
          </div>
        );
      })}
      {edit && (
        <HeaderTargetDialog
          copy={c}
          pages={pages}
          sections={sections}
          value={edit.link.target}
          label={edit.link.label}
          onClose={() => setEdit(null)}
          onSave={save}
          onRemove={
            flatten.some((row) => row.link.id === edit.link.id)
              ? () => {
                  remove(edit.link.id);
                  setEdit(null);
                }
              : undefined
          }
          extra={
            <InspectorField label={c.parent}>
              <select
                className={controlClass}
                value={edit.parent ?? ""}
                disabled={Boolean(edit.link.children?.length)}
                onChange={(e) =>
                  setEdit({ ...edit, parent: e.target.value || null })
                }
              >
                <option value="">{c.topLevel}</option>
                {value
                  .filter((l) => l.id !== edit.link.id)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
              </select>
            </InspectorField>
          }
        />
      )}
    </div>
  );
}
