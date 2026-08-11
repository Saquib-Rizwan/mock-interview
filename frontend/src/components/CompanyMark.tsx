/**
 * A company monogram — a solid cream block with the letters knocked out of it.
 *
 * WHY NOT REAL LOGOS: they are trademarks we have no licence to redistribute,
 * and a wall of borrowed logos would imply an affiliation this project does not
 * have. A monogram gives the same recognition honestly, and a company added to
 * the catalogue next month needs no new asset.
 *
 * WHY NOT PER-COMPANY COLOURS: an earlier pass gave each company its own hue
 * from a twelve-stop palette. It was dropped deliberately. The punch of this
 * design comes from having exactly two colours, and ten tinted tiles dilute
 * that into pastel soup — the vermilion stops meaning anything once five other
 * hues are competing with it. Companies are told apart by their letters, which
 * is what a monogram is for, and the accent stays reserved for state: a block
 * turns vermilion on hover and nowhere else.
 */

import { COMPANY_LOGOS } from "./companyLogos";

/**
 * Acronyms stay whole — "TCS" reads as TCS, not "TC". Anything longer collapses
 * to two characters, which is all that fits legibly in the small tile.
 */
function monogram(name: string): string {
  const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) {
    const word = words[0];
    return (word.length <= 4 ? word : word.slice(0, 2)).toUpperCase();
  }
  return words
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function CompanyMark({
  name,
  size = "md",
}: {
  name: string;
  /** `sm` for the rail strip, `md` for lists, `lg` for a page heading. */
  size?: "sm" | "md" | "lg";
}) {
  // Falls back to letters when there is no logo for this company, so a
  // catalogue entry can never render as a broken image.
  const logo = COMPANY_LOGOS[name];

  return (
    // Decorative: the company name is always rendered as real text beside it.
    <span className={`cmark cmark-${size}`} aria-hidden="true">
      {logo ? (
        // `currentColor` is what keeps a real trademark inside the two-colour
        // system — the logo is knocked out of the block and turns with it.
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d={logo} />
        </svg>
      ) : (
        monogram(name)
      )}
    </span>
  );
}
