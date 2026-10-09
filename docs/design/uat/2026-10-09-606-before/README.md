# UAT 2026-10-09-606-before

Base http://localhost:8140, 375x812. Written by scripts/uat.mjs.

| # | Step | Result | Read off the page | Shot |
|---|---|---|---|---|
| 01 | Opening hours offers Pacific/Auckland and the other zones, grouped after the common ones | FAIL | TimeoutError: locator.selectOption: Timeout 30000ms exceeded. Call log:   - waiting for getByRole('dialog').last().getByLabel('Timezone') | ![01](01.png) |
