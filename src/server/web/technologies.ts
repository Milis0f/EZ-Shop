import type { Technology, TechnologyCategory } from "@/domain/competitor";

/**
 * Technologies a page shows in its own code: platform, payments, analytics, ads pixels, reviews,
 * marketing, support. Each comes with the evidence that was seen. Not seeing one does not mean the shop
 * does not use it: scripts can load later or from elsewhere.
 */

type Signature = readonly [name: string, category: TechnologyCategory, pattern: RegExp, evidence: string];

const SIGNATURES: readonly Signature[] = [
  ["Shopify", "platform", /cdn\.shopify\.com|Shopify\.theme/i, "cdn.shopify.com"],
  ["WooCommerce", "platform", /woocommerce/i, "woocommerce"],
  ["PrestaShop", "platform", /prestashop/i, "prestashop"],
  ["Magento", "platform", /Magento_|mage\/cookies/i, "Magento"],
  ["Wix", "platform", /static\.wixstatic\.com|wix\.com/i, "wixstatic"],
  ["Squarespace", "platform", /static1\.squarespace\.com/i, "squarespace"],
  ["BigCommerce", "platform", /cdn\d*\.bigcommerce\.com/i, "bigcommerce"],
  ["Shopify Payments", "payments", /shopify-payment|ShopifyPay|shop_pay/i, "shop pay"],
  ["PayPal", "payments", /paypal\.com\/sdk|paypalobjects/i, "paypal sdk"],
  ["Stripe", "payments", /js\.stripe\.com/i, "js.stripe.com"],
  ["Klarna", "payments", /klarna/i, "klarna"],
  ["Afterpay / Clearpay", "payments", /afterpay|clearpay/i, "afterpay"],
  ["Google Analytics", "analytics", /googletagmanager\.com\/gtag|google-analytics\.com/i, "gtag"],
  ["Google Tag Manager", "analytics", /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/, "gtm.js"],
  ["Hotjar", "analytics", /static\.hotjar\.com/i, "hotjar"],
  ["Microsoft Clarity", "analytics", /clarity\.ms/i, "clarity.ms"],
  ["Meta Pixel", "ads", /connect\.facebook\.net\/[^"']*fbevents|fbq\(/i, "fbevents.js"],
  ["TikTok Pixel", "ads", /analytics\.tiktok\.com/i, "analytics.tiktok.com"],
  ["Pinterest Tag", "ads", /s\.pinimg\.com\/ct\/core\.js|pintrk\(/i, "pintrk"],
  ["Snap Pixel", "ads", /sc-static\.net\/scevent/i, "scevent"],
  ["Google Ads", "ads", /googleadservices\.com|AW-\d{6,}/, "AW- tag"],
  ["Klaviyo", "marketing", /klaviyo/i, "klaviyo"],
  ["Mailchimp", "marketing", /chimpstatic\.com|list-manage\.com/i, "mailchimp"],
  ["Omnisend", "marketing", /omnisend/i, "omnisend"],
  ["Judge.me", "reviews", /judge\.me/i, "judge.me"],
  ["Loox", "reviews", /loox\.io/i, "loox.io"],
  ["Yotpo", "reviews", /yotpo/i, "yotpo"],
  ["Trustpilot", "reviews", /widget\.trustpilot\.com/i, "trustpilot widget"],
  ["Gorgias", "support", /gorgias/i, "gorgias"],
  ["Tidio", "support", /tidio/i, "tidio"],
  ["Zendesk", "support", /zdassets\.com|zendesk/i, "zendesk"],
  ["Cloudflare", "infrastructure", /cdn-cgi\//i, "cdn-cgi"],
];

/** Response headers worth reading; values are matched, never stored whole. */
const HEADER_SIGNATURES: ReadonlyArray<readonly [name: string, category: TechnologyCategory, header: string, pattern: RegExp]> = [
  ["Cloudflare", "infrastructure", "server", /cloudflare/i],
  ["Shopify", "platform", "x-shopid", /./],
  ["Fastly", "infrastructure", "x-served-by", /cache-/i],
  ["Vercel", "infrastructure", "server", /vercel/i],
];

export function detectTechnologies(html: string, headers: Readonly<Record<string, string>> = {}): Technology[] {
  const found = new Map<string, Technology>();
  for (const [name, category, pattern, evidence] of SIGNATURES) if (pattern.test(html)) found.set(name, { name, category, evidence: `page: ${evidence}` });
  for (const [name, category, header, pattern] of HEADER_SIGNATURES) {
    const value = headers[header];
    if (value && pattern.test(value) && !found.has(name)) found.set(name, { name, category, evidence: `header: ${header}` });
  }
  return [...found.values()];
}
