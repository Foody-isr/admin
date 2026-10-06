import {
  normalizeWebsiteHeader,
  type HeaderLink,
  type HeaderTarget,
} from "./header";
import type { DraftStatePayload } from "./types";
/** Keeps navigation, section actions and footer links attached when a page slug is edited. */
export function retargetNavigationPage(
  state: DraftStatePayload,
  previous: string,
  next: string,
): DraftStatePayload {
  if (previous === next) return state;
  const layout = state.config.nav_layout;
  const record =
    layout && typeof layout === "object"
      ? (layout as Record<string, unknown>)
      : {};
  const retargetHref = (value: unknown) => {
    if (typeof value !== "string") return value;
    const [path] = value.split(/[?#]/);
    return path === `/${previous}`
      ? `/${next}${value.slice(path.length)}`
      : value;
  };
  const retargetContent = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(retargetContent);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        ["cta_link", "link", "url"].includes(key)
          ? retargetHref(entry)
          : retargetContent(entry),
      ]),
    );
  };
  return {
    ...state,
    sections: state.sections.map((section) => ({
      ...section,
      content: retargetContent(section.content) as typeof section.content,
    })),
    config: {
      ...state.config,
      ...(state.config.navbar_cta && typeof state.config.navbar_cta === "object"
        ? { navbar_cta: retargetContent(state.config.navbar_cta) }
        : {}),
      nav_layout: {
        ...record,
        ...(record.header
          ? {
              header: retargetHeader(
                normalizeWebsiteHeader(record.header),
                previous,
                next,
              ),
            }
          : {}),
        ...(Array.isArray(record.links)
          ? {
              links: (record.links as Record<string, unknown>[]).map((link) =>
                link.page_slug === previous
                  ? { ...link, page_slug: next }
                  : retargetContent(link),
              ),
            }
          : {}),
        ...(record.theme_pages && typeof record.theme_pages === "object"
          ? {
              theme_pages: Object.fromEntries(
                Object.entries(record.theme_pages).map(([role, slug]) => [
                  role,
                  slug === previous ? next : slug,
                ]),
              ),
            }
          : {}),
      },
    },
  };
}

/** Adds the page to an explicitly edited navigation without changing legacy automatic navigation. */
export function addNavigationPage(
  state: DraftStatePayload,
  page: DraftStatePayload["pages"][number],
): DraftStatePayload {
  const layout = state.config.nav_layout as Record<string, unknown> | undefined;
  if (layout?.header && page.nav_visible) {
    const header = normalizeWebsiteHeader(layout.header);
    const allLinks = header.navigation.links.flatMap((link) => [
      link,
      ...(link.children ?? []),
    ]);
    if (
      allLinks.some(
        (link) =>
          link.target.kind === "page" && link.target.value === page.slug,
      )
    )
      return state;
    return {
      ...state,
      config: {
        ...state.config,
        nav_layout: {
          ...layout,
          header: {
            ...header,
            navigation: {
              ...header.navigation,
              links: [
                ...header.navigation.links,
                {
                  id: `page-${page.id ?? page.tmp_id}`,
                  label: page.title,
                  target: { kind: "page", value: page.slug },
                },
              ],
            },
          },
        },
      },
    };
  }
  if (
    !page.nav_visible ||
    !layout ||
    !Array.isArray(layout.links) ||
    layout.links.some((link) => link.page_slug === page.slug)
  )
    return state;
  return {
    ...state,
    config: {
      ...state.config,
      nav_layout: {
        ...layout,
        links: [
          ...layout.links,
          {
            id: `page-${page.id ?? page.tmp_id}`,
            label: page.title,
            page_slug: page.slug,
          },
        ],
      },
    },
  };
}

function retargetHeader(
  header: ReturnType<typeof normalizeWebsiteHeader>,
  previous: string,
  next: string,
) {
  const target = (value: HeaderTarget): HeaderTarget =>
    value.kind === "page" && value.value === previous
      ? { ...value, value: next }
      : value;
  const links = (values: HeaderLink[]): HeaderLink[] =>
    values.map((link) => ({
      ...link,
      target: target(link.target),
      children: links(link.children ?? []),
    }));
  return {
    ...header,
    logo: { ...header.logo, link: target(header.logo.link) },
    button: { ...header.button, link: target(header.button.link) },
    navigation: { ...header.navigation, links: links(header.navigation.links) },
  };
}

/** Removes a page destination while keeping its remaining sub-pages reachable. */
export function removeNavigationPage(
  state: DraftStatePayload,
  slug: string,
): DraftStatePayload {
  const layout = state.config.nav_layout as Record<string, unknown> | undefined;
  if (!layout?.header) return state;
  const header = normalizeWebsiteHeader(layout.header);
  const matches = (link: HeaderLink) =>
    link.target.kind === "page" && link.target.value === slug;
  const links = header.navigation.links.flatMap((link) =>
    matches(link)
      ? (link.children ?? []).filter((child) => !matches(child))
      : [
          {
            ...link,
            children: link.children?.filter((child) => !matches(child)),
          },
        ],
  );
  return {
    ...state,
    config: {
      ...state.config,
      nav_layout: {
        ...layout,
        header: { ...header, navigation: { ...header.navigation, links } },
      },
    },
  };
}
