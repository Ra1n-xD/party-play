import { renderToStaticMarkup } from "react-dom/server";
import { PublicPage } from "./PublicPage";
import { NotFoundScreen } from "../screens/NotFoundScreen";
import {
  getPageMetadata,
  getStructuredData,
  publicPages,
  utilityPages,
  SITE_URL,
  SOCIAL_IMAGE,
} from "./siteMetadata";

export { publicPages, utilityPages, SITE_URL };

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );

export function renderPage(path: string, template: string): string {
  const page = getPageMetadata(path);
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);
  const canonical = escapeHtml(`${SITE_URL}${page.path}`);
  const structured = JSON.stringify(getStructuredData(path)).replace(/</g, "\\u003c");
  const head = `
    <meta name="description" content="${description}" />
    <meta name="robots" content="${page.indexable ? "index, follow, max-image-preview:large" : "noindex, follow"}" />
    <link rel="canonical" href="${canonical}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="PartySide" />
    <meta property="og:locale" content="ru_RU" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${SOCIAL_IMAGE}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="PartySide — игры для своей компании: Бункер, Дурак и UNO" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${SOCIAL_IMAGE}" />
    <script type="application/ld+json" id="site-structured-data">${structured}</script>`;
  const content = page.indexable
    ? renderToStaticMarkup(<PublicPage path={path} />)
    : path === "/404"
      ? renderToStaticMarkup(<NotFoundScreen />)
      : '<main><p>PartySide — игры для своей компании.</p><p><a href="/">К каталогу игр</a></p></main>';
  return template
    .replace(/<title>.*?<\/title>/s, `<title>${title}</title>`)
    .replace("<!--seo-head-->", head)
    .replace('<div id="root"></div>', `<div id="root">${content}</div>`);
}
