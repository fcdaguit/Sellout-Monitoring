# FAST Weekly Sell-out Performance Dashboard

Static site (HTML/CSS/JS + Chart.js CDN). Same look as the Regional Ops KPI dashboard. Deploy on GitHub Pages: push this folder, Settings > Pages > main / root.

- **Data**: `data/config.json` > `sheetUrl` (published-to-web CSV). Columns: SalesPerson, Position, Salesman Code, Customer Code, Customer Name, Channel, Period_Week, Projection, Actual. Position is read from the sheet.
- **Fallback**: if the live fetch fails, `data/sample.csv` (SYNTHETIC) is shown with a red warning banner. Regenerate with `node scripts/make-sample.js > data/sample.csv`.
- **Filters**: Salesman, Position, Channel, Week (default = latest week with sell-out). Click a salesman bar to focus; Top 10 customers appear when exactly one salesman is selected.
- **Status colours**: green >=100%, yellow 90-99%, red <90% (`thresholds` in config.json).
- **Definitions**: Achievement = Actual / Projection. Active Salesmen/Accounts = sell-out > 0 in scope. Shortfall = max(0, Projection - Actual) per salesman-account-channel over the selected weeks; contribution % are shares of total shortfall.
- No login (the sheet is already public via publish-to-web).
