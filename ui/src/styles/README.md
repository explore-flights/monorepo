# CSS architecture

The UI uses a hybrid styling model. `styles.css` is the ordered global entry point; colocated
`*.module.css` files own isolated component styles.

The global imports deliberately preserve cascade order:

- `00`–`01`: design tokens and document-level foundations.
- `10`–`19`: page and feature styles.
- `30`–`35`: responsive foundations and reusable tools.
- `40`: the shared readable type scale.
- `50`–`53`: schedule workspaces and their responsive behavior.

Keep runtime theme values in `00-tokens.css` as CSS custom properties. CSS Modules consume the same
tokens with `var(--token-name)` because custom properties cross module boundaries. Prefer those
tokens over literal spacing, color, radius, duration, and layer values.

Use a colocated CSS Module when the selectors belong to one React component and its internal states.
Import that module from the owning TSX file; do not add it to `styles.css`. Keep document resets,
themes, app-shell and page layout, shared primitives, and selectors coordinating several components
in the global stylesheets.

Use `:global(...)` inside a module only for intentional integration points such as a third-party
library class. Prefer explicit props and local state classes for application-owned variants.

Put an isolated component's responsive rules in its CSS Module. Put page-level responsive rules in
the closest matching global responsive stylesheet. The supported breakpoints are 1200px, 1024px,
960px, and 640px. Use container queries when a component's own width, rather than the viewport,
controls its layout.

Avoid `!important`. Resolve conflicts by giving the owning component an appropriately scoped
selector or by correcting source order. `npm run lint:css` catches duplicate selectors, duplicate
properties, invalid selectors, and other structural mistakes.
