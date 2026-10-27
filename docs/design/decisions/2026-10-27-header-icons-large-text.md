# Header icons go under the title at large text (#1317)

When a page header with ‹ Back is narrower than about 18rem (on a 375px phone, text at roughly 125% or more), the search and gear icons take their own centred line under the title instead of sitting beside it, where they covered it. At normal text nothing moves. Done with a CSS container query in `src/index.css`, so every screen with `PageHead` gets it.
