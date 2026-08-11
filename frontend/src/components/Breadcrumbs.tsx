import { Link } from "react-router-dom";

export type Crumb = { label: string; to?: string };

// The last crumb is the current page and is rendered as plain text, since
// linking to where you already are is a dead control.
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="crumbs">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`}>
          {/* A slash rather than a chevron: the folio line of a printed page,
              and one less glyph that needs an icon font behind it. */}
          {i > 0 && <span aria-hidden="true"> / </span>}
          {item.to ? <Link to={item.to}>{item.label}</Link> : <span>{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}
