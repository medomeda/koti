import type { MetadataRoute } from "next";

/** Manifeste de la PWA : installation sur l'écran d'accueil (Android, iPhone, ordinateur). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "KOTI — Gestion de tontines",
    short_name: "KOTI",
    description: "Créez, organisez et suivez vos tontines : membres, cotisations, paiements et tours de main.",
    lang: "fr",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f7f6",
    theme_color: "#15803d",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Mes paiements", short_name: "Paiements", url: "/payments", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Mes tontines", short_name: "Tontines", url: "/tontines", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
