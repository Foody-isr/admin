import media from "./restaurant-theme-media.json";
import type { RestaurantTheme } from "./restaurant-themes";
import { squareDefaultContent, squareDefaultSettings } from "./square-components";

export type ThemeCopy = {
  home: string; about: string; locations: string; contact: string;
  menu: string; catering: string; events: string; story: string;
  headline: string; welcome: string; discover: string; fresh: string;
  starters: string; mains: string; drinks: string; send: string;
  name: string; email: string; message: string;
};

/** Defaults for non-UI callers; the editor supplies its localized copy. */
export const DEFAULT_THEME_COPY: ThemeCopy = {
  home: "Home", about: "About", locations: "Visit us", contact: "Contact",
  menu: "Our menu", catering: "Catering", events: "Events", story: "Our story",
  headline: "Good food. Your way.", welcome: "Welcome to our table.",
  discover: "Discover our menu", fresh: "Freshly prepared • Made to share •",
  starters: "Starters", mains: "Mains", drinks: "Drinks", send: "Send",
  name: "Name", email: "Email", message: "Message",
};

/** Reference media observed in the public Square restaurant theme previews. */
export function restaurantThemeMedia(theme: RestaurantTheme) {
  return media[theme.id as keyof typeof media];
}

type BlueprintContext = {
  title: string; description: string; image: string; cta: string;
  copy: ThemeCopy; links: Record<string, string>;
};

/** Builds an entire editable section, without inheriting a previous theme's geometry or hidden fields. */
export function restaurantThemeSection(
  theme: RestaurantTheme, type: string, occurrence: number,
  role: string, context: BlueprintContext,
) {
  const { copy, links } = context;
  const assets = restaurantThemeMedia(theme);
  const photo = assets.images[occurrence % Math.max(1, assets.images.length)] || assets.hero || context.image;
  let content = squareDefaultContent(type);
  let layout = "default";
  const settings: Record<string, unknown> = {
    ...squareDefaultSettings(type), theme_layout: theme.id,
  };
  if (type === "hero_banner") {
    layout = role === "home" ? theme.hero : "split";
    content = {
      headline: role === "home" ? copy.headline : (copy[role as keyof ThemeCopy] || context.title),
      subheadline: context.description || (role === "home" ? "" : copy.welcome),
      image_url: assets.hero || context.image,
      cta_text: context.cta, cta_link: links.order || links.menu || links.home,
    };
    Object.assign(settings, {
      height: "tall", text_alignment: "center", text_align: "center",
      vertical_align: "center", bg_overlay: false,
      inset_bg: theme.bg, inset_ink: theme.ink,
      show_headline: true, show_subheadline: true, show_image_url: true, show_cta_text: true,
      ...(layout !== "inset" && layout !== "split" ? {
        headline_color: "#ffffff", subheadline_color: "#ffffff", bg_overlay: true,
      } : {}),
    });
  } else if (type === "text_and_image") {
    layout = occurrence % 2 ? "image_left" : "default";
    content = {
      title: role === "home" ? (occurrence % 2 ? copy.catering : copy.story) : (copy[role as keyof ThemeCopy] || copy.story),
      body: context.description || copy.welcome, image_url: photo,
      cta_text: role === "home" ? copy.discover : context.cta,
      cta_link: role === "home" ? (occurrence % 2 ? links.catering : links.about) || links.order || links.home : links.order || links.home,
    };
    settings.text_alignment = "left";
    if (theme.id === "youngs-place" && role === "home") settings.image_only = true;
  } else if (type === "text") {
    layout = "split";
    content = { title: copy.story, body: context.description || copy.welcome,
      cta_text: copy.about, cta_link: links.about || links.home };
  } else if (type === "scrolling_text") {
    content = { text: theme.id === "youngs-place" ? `${context.title} • ${copy.fresh}` : copy.fresh };
  } else if (type === "featured_menu" || type === "menu_highlights") {
    layout = type === "featured_menu" ? "list" : "carousel";
    content = { title: copy.menu, subtitle: copy.discover, item_ids: [] };
    // Resolve from the public menu, so items outside web-enabled groups never leak into the theme.
    settings.auto_select_items = true;
  } else if (type === "featured_categories" || type === "events") {
    layout = type === "events" ? "list" : "grid";
    content = { title: type === "events" ? copy.events : copy.discover,
      cards: (type === "events" ? [copy.events] : [copy.starters, copy.mains, copy.drinks]).map((title, i) => ({
        title, image_url: assets.images[i] || assets.hero,
        link: links.order || links.menu || links.contact || links.home,
      })) };
  } else if (type === "testimonials") {
    // Never invent customer endorsements for a real restaurant.
    layout = "carousel";
    content = { title: copy.welcome, reviews: [] };
  } else if (type === "location_hours") {
    layout = "map_right";
    content = { ...content, title: copy.locations };
  } else if (type === "forms") {
    layout = role === "catering" ? "quote" : "contact";
    content = { title: copy[role as keyof ThemeCopy] || copy.contact, cta_text: copy.send,
      fields: [
        { id: "name", label: copy.name, type: "text", required: true },
        { id: "email", label: copy.email, type: "email", required: true },
        { id: "message", label: copy.message, type: "textarea", required: true },
      ] };
  } else if (type === "footer") {
    layout = "columns";
    content = { ...content, links: Object.entries(links).filter(([key]) => key !== "home").map(([key, url]) => ({
      label: key === "order" ? context.cta : copy[key as keyof ThemeCopy] || key, url,
    })) };
  }
  if (theme.id === "joy-bakery" && type === "hero_banner")
    Object.assign(settings, { bg_overlay: false, headline_color: theme.ink, subheadline_color: theme.ink });
  if (theme.id === "joy-bakery" && ["testimonials", "location_hours", "footer"].includes(type))
    Object.assign(settings, { color_style: "custom", custom_bg: theme.accent, custom_text: theme.bg });
  return { content, layout, settings };
}
