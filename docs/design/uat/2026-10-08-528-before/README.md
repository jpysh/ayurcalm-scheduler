# UAT 2026-10-08-528-before

Base http://localhost:8140, 375x812. Written by scripts/uat.mjs.

| # | Step | Result | Read off the page | Shot |
|---|---|---|---|---|
| 01 | The therapy sheet has the Before a purification switch, on for the library one | FAIL | switch null; no list line | ![01](01.png) |
| 02 | The warning offers the day before the purification; tapping it moves the booking there | FAIL | TimeoutError: locator.click: Timeout 5000ms exceeded. Call log:   - waiting for getByRole('dialog').last().getByRole('button', { name: /instead$/ }) | ![02](02.png) |
