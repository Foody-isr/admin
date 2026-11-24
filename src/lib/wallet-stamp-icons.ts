import {
  Coffee, Cookie, Croissant, Hamburger, IceCreamCone, Martini, Pizza, Salad, Star,
  createLucideIcon,
} from "lucide-react";

const Sushi = createLucideIcon("sushi", [
  ["ellipse", { cx: "12", cy: "8.5", rx: "9", ry: "4.5", key: "rice" }],
  ["ellipse", { cx: "12", cy: "8.5", rx: "2.6", ry: "1.5", key: "filling" }],
  ["path", { d: "M3 8.5v7c0 2.5 4 4.5 9 4.5s9-2 9-4.5v-7", key: "nori" }],
]);

const Falafel = createLucideIcon("falafel", [
  ["path", { d: "M3.4 13.3a3.4 3.4 0 0 1 3.4-5.2 3.8 3.8 0 0 1 6.7-2.4 3.5 3.5 0 0 1 6 2.3", key: "falafels" }],
  ["path", { d: "M3 13.5c5.5-.5 11.3-2.2 17.4-5.6a.6.6 0 0 1 .9.6c-.1 6.8-3.9 11.9-9.1 12.4-4.4.4-8.1-2.5-9.2-7.4Z", key: "pita" }],
  ["path", { d: "m8.3 16.2 1.2.5", key: "crumb" }],
]);

const Bagel = createLucideIcon("bagel", [
  ["ellipse", { cx: "12", cy: "12", rx: "9.5", ry: "7.7", key: "crust" }],
  ["ellipse", { cx: "12", cy: "12", rx: "3", ry: "2.2", key: "hole" }],
  ["path", { d: "m7.3 8.9.8-.5m5-1.2.8.2m3.8 6.4.5-.6m-8.9 3.3.8.4", key: "seeds" }],
]);

const Skewer = createLucideIcon("skewer", [
  ["path", { d: "m3 21 4-4m9-9 5-5", key: "stick" }],
  ["path", { d: "m5.2 13.8 3-3 5 5-3 3a1 1 0 0 1-1.4 0l-3.6-3.6a1 1 0 0 1 0-1.4Z", key: "pepper" }],
  ["path", { d: "m10.8 8.2 3-3a1.8 1.8 0 0 1 2.5 0l2.5 2.5a1.8 1.8 0 0 1 0 2.5l-3 3Z", key: "grill" }],
  ["path", { d: "m10.5 12 2.1-2.1", key: "middle" }],
]);

const Ramen = createLucideIcon("ramen", [
  ["path", { d: "M2.5 12.5h19a9.5 9.5 0 0 1-19 0Zm6.5 8 1 1h4l1-1", key: "bowl" }],
  ["path", { d: "m9 8 11-5m-8 6 10-3", key: "chopsticks" }],
  ["path", { d: "M6 12.5V11a2 2 0 0 1 4 0v1.5m3 0v-2", key: "noodles" }],
]);

/** Motifs for empty visit stamps. Native Wallet PNG masks use these same outlines. */
export const walletStampIcons = {
  coffee: { Icon: Coffee, label: "stampCoffee" },
  croissant: { Icon: Croissant, label: "stampCroissant" },
  burger: { Icon: Hamburger, label: "stampBurger" },
  pizza: { Icon: Pizza, label: "stampPizza" },
  sushi: { Icon: Sushi, label: "stampSushi" },
  falafel: { Icon: Falafel, label: "stampFalafel" },
  bagel: { Icon: Bagel, label: "stampBagel" },
  skewer: { Icon: Skewer, label: "stampSkewer" },
  ramen: { Icon: Ramen, label: "stampRamen" },
  salad: { Icon: Salad, label: "stampSalad" },
  ice_cream: { Icon: IceCreamCone, label: "stampIceCream" },
  cookie: { Icon: Cookie, label: "stampCookie" },
  cocktail: { Icon: Martini, label: "stampCocktail" },
  star: { Icon: Star, label: "stampStar" },
} as const;

/** Identifier saved with a restaurant's visit stamp design. */
export type WalletStampIcon = keyof typeof walletStampIcons;
