import { useEffect } from "react";
import { getPageMetadata, getStructuredData, SITE_URL, SOCIAL_IMAGE } from "./siteMetadata";

export function PageMetadata({ path }: { path: string }) {
  useEffect(() => {
    const page = getPageMetadata(path);
    document.title = page.title;
    const meta = (attribute: "name" | "property", key: string, content: string) => {
      let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
      if (!element) {
        element = document.createElement("meta");
        element.setAttribute(attribute, key);
        document.head.appendChild(element);
      }
      element.content = content;
    };
    meta("name", "description", page.description);
    meta(
      "name",
      "robots",
      page.indexable ? "index, follow, max-image-preview:large" : "noindex, follow",
    );
    meta("property", "og:title", page.title);
    meta("property", "og:description", page.description);
    meta("property", "og:url", `${SITE_URL}${page.path}`);
    meta("property", "og:type", "website");
    meta("property", "og:site_name", "PartySide");
    meta("property", "og:locale", "ru_RU");
    meta("property", "og:image", SOCIAL_IMAGE);
    meta("name", "twitter:card", "summary_large_image");
    meta("name", "twitter:title", page.title);
    meta("name", "twitter:description", page.description);
    meta("name", "twitter:image", SOCIAL_IMAGE);
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = `${SITE_URL}${page.path}`;
    let structured = document.head.querySelector<HTMLScriptElement>("#site-structured-data");
    if (!structured) {
      structured = document.createElement("script");
      structured.id = "site-structured-data";
      structured.type = "application/ld+json";
      document.head.appendChild(structured);
    }
    structured.textContent = JSON.stringify(getStructuredData(path));
  }, [path]);
  return null;
}
