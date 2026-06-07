# RecipeBank — Claude Code Instructions

## Dependency management

### Never introduce `^` or `~` on these packages
The following packages have caused breaking changes when auto-upgraded. Always pin them to an exact version (no range prefix):

- `next`
- `@prisma/client`
- `prisma`
- `react`
- `react-dom`

When adding or updating any of these, write the exact resolved version, e.g. `"next": "15.3.3"` not `"next": "^15.3.3"`.

### Before upgrading any package to a new major version
1. Run `npm outdated` and show the user the output so they can see what is changing.
2. If any package is jumping a major version (e.g. 6.x → 7.x), stop and summarise the breaking changes from that package's migration guide before proceeding.
3. Never run `npm update` silently — always confirm with the user first.

### After any `npm install` or `npm update`
Check that the pinned packages above were not inadvertently changed:

```bash
node -e "const p = require('./package.json'); ['next','@prisma/client','prisma','react','react-dom'].forEach(k => console.log(k, p.dependencies?.[k] ?? p.devDependencies?.[k]))"