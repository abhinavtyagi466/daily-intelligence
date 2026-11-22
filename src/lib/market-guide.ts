import type { MarketResearchInput } from "./research-schema";

export const marketGuide = {
  slug: "market-intelligence-guide",
  title: "Product demand and shipment estimation",
  summary: "Track the same model, variant, geography, and date window across sources. Start with reported shipments and matched retail sell-through. Use marketplace activity and search interest to test whether the direction holds across channels.",
  content: {
    signals: [
      {
        name: "OEM shipments and retail sell-through",
        measures: "OEM disclosures and distributor reports can anchor shipments. Matched retailer reports can anchor units sold to customers.",
        limitation: "Separate sell-in from sell-through. Check channel, territory, returns, and model coverage before comparing the figures.",
      },
      {
        name: "Amazon Best Sellers Rank",
        measures: "Track changes in relative sales rank for a consistent Amazon category and listing.",
        limitation: "Category changes, promotions, and competitors can shift the rank. A units estimate needs sales observations matched to this category and period.",
      },
      {
        name: "Amazon and Flipkart ratings and reviews",
        measures: "Track the change in review counts and rating distribution for matched listings. Record variant grouping, price, and stock alongside each snapshot.",
        limitation: "Review rates vary by platform, product, and period. Shared variants and delayed reviews can distort a model-level estimate.",
      },
      {
        name: "Google Trends",
        measures: "Compare normalized search interest across exact model names within a consistent geography and time range.",
        limitation: "News, launches, and service issues also drive searches. Treat search interest as an attention signal.",
      },
      {
        name: "BIS registration",
        measures: "Match exact registered model identifiers and manufacturer information to narrow candidate listings.",
        limitation: "A registration records compliance for the listed product. Its issue date can precede availability.",
      },
    ],
    scenarios: [
      {
        title: "Demand rises across channels",
        condition: "Rank improves within the same category, new reviews accelerate, and matched retailers report stronger sell-through.",
        implication: "Demand growth is plausible. Check whether it persists past the current promotion.",
        watch_for: "Stock availability, discount dates, channel mix, and confirmed sales for the same model.",
      },
      {
        title: "Attention spikes before sales",
        condition: "Search interest jumps around a launch while retailer sell-through and review growth stay flat.",
        implication: "Wait for conversion evidence before raising the sales range. Check if stock or availability delayed purchases.",
        watch_for: "Launch timing, stock by channel, and the lag between purchase and review.",
      },
      {
        title: "Sales shift between channels",
        condition: "Amazon rank improves while Flipkart or offline sell-through falls for the same model.",
        implication: "A change in where people buy could explain the divergence. Estimate each channel separately.",
        watch_for: "Platform-exclusive discounts, stock-outs, and changes in retailer coverage.",
      },
      {
        title: "Shipments rise ahead of sell-through",
        condition: "OEM or distributor shipments rise while end-customer sales are flat or unreported.",
        implication: "The increase could reflect inventory build. Wait for retailer evidence before estimating consumer demand.",
        watch_for: "Channel inventory, returns, replenishment, and the next retail sales report.",
      },
    ],
    limitations: [
      "Avoid exact model-level units when matched calibration data is missing. If calibrated, report a range with the assumed review rate or rank-to-sales model, channel coverage, and error.",
      "Deduplicate listing variants and overlapping distributor or retailer totals before combining channels.",
      "Keep the observation date, source URL, and the geographic scope for each signal.",
    ],
    references: [
      { title: "Amazon on how Best Sellers Rank works", url: "https://sell.amazon.com/blog/amazon-best-sellers-rank" },
      { title: "Google Trends data and normalization", url: "https://support.google.com/trends/answer/4365533?hl=en" },
      { title: "BIS compulsory registration scheme", url: "https://www.bis.gov.in/product-certification/products-under-compulsory-certification/scheme-ii-registration-scheme/?lang=en" },
    ],
  },
} satisfies MarketResearchInput;
