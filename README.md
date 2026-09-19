# Margin of safety screener

A static website that screens stocks for value. It pulls price and fundamentals from the Finnhub API, estimates what each share is worth with three models, and ranks stocks by how far the price sits below that estimate.

Everything runs in the browser, so it hosts for free on GitHub Pages. There is no server and no build step.

## Put it online with GitHub Pages

1. Create a new **public** repository on GitHub (for example `margin-of-safety`).
2. Upload every file in this folder: `index.html`, `styles.css`, `app.js`, `valuation.js`, `README.md`, and the `test` folder.
3. In the repository, open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save.
4. After a minute the site is live at `https://<your-username>.github.io/margin-of-safety/`.
5. Get a free API key at [finnhub.io/register](https://finnhub.io/register), paste it into the page, and press **Run screen**.

**Never put your API key in the code or commit it.** The repository is public. The page asks for the key in the browser and only sends it to Finnhub. "Remember on this device" stores it in that browser's local storage.

## How value is estimated

| Model | Formula | Needs |
|---|---|---|
| Graham number | `sqrt(22.5 × EPS × book value per share)` | positive EPS and book value |
| Discounted cash flow | 10 years of free cash flow per share, growth fading from the 5-year average to the terminal rate, plus a terminal value | positive free cash flow per share |
| Graham growth formula | `EPS × (8.5 + 2g) × 4.4 / AAA yield` | positive EPS |

- **Estimated value** is the median of the models that can run.
- **Margin of safety** is `(value − price) / value`.
- **Score** (0–100) ranks each stock against the others loaded: 40% margin of safety, 20% free cash flow yield, 20% earnings yield, 10% book value yield, 10% return on equity.
- Growth is the average of 5-year EPS and revenue growth, clamped between −3% and the growth cap you set.

Discount rate, terminal growth, growth cap and AAA yield are adjustable in the page, and the table updates instantly.

## Limits worth knowing

- The models use trailing numbers. They flatter cyclical companies at a profit peak and punish growth companies that reinvest heavily.
- Free cash flow is not meaningful for banks and insurers, so expect weak results for financials.
- A stock can be cheap because something is wrong. Each row lists warnings (negative cash flow, models disagreeing, trading near a 52-week low), and you should read the company's filings before acting on anything.
- The free Finnhub plan allows roughly 50 calls a minute and each stock needs two, so the page waits between calls. Results are cached for 12 hours.
- This is a screening tool, not investment advice.

## Data source notes

The page reads Finnhub's `/quote` and `/stock/metric?metric=all` endpoints. `valuation.js` looks for several alternative field names for each input and falls back gracefully, but if Finnhub renames a field the affected model will show as unavailable. The list of fields is `METRIC_KEYS` at the top of `valuation.js`.

## Tests

The valuation math has unit tests that run in Node with no dependencies:

```
node test/valuation.test.js
```

## Ideas to extend it

- Add company names and sectors with Finnhub's `/stock/profile2` and compare multiples within a sector.
- Load a full index list (for example the S&P 500) from a JSON file in the repo.
- Add a historical-multiples check: current P/E versus the stock's own 5-year average.
