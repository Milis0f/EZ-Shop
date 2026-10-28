import { describe, expect, it } from "vitest";
import { parseSupplierUrl } from "./supplier-url";


describe("parseSupplierUrl product pages", () => {
  it.each([
    {
      input:
        "https://fr.aliexpress.com/item/1005006294811234.html?spm=a2g0o.productlist.main.1&algo_pvid=7f1c2e#nav-review",
      platform: "aliexpress",
      productId: "1005006294811234",
      canonicalUrl: "https://fr.aliexpress.com/item/1005006294811234.html",
    },
    {
      input: "https://m.aliexpress.com/item/1005005123456789.html?sourceType=1",
      platform: "aliexpress",
      productId: "1005005123456789",
      canonicalUrl: "https://m.aliexpress.com/item/1005005123456789.html",
    },
    {
      input: "https://www.temu.com/goods.html?goods_id=601099527000001&_x_ads_channel=google&refer_page_name=home",
      platform: "temu",
      productId: "601099527000001",
      canonicalUrl: "https://www.temu.com/goods.html?goods_id=601099527000001",
    },
    {
      input:
        "https://www.temu.com/fr/casquette-de-baseball-unisexe-g-601099512345678.html?_oak_mp_inf=EKa3&top_gallery_url=x",
      platform: "temu",
      productId: "601099512345678",
      canonicalUrl: "https://www.temu.com/fr/casquette-de-baseball-unisexe-g-601099512345678.html",
    },
    {
      input:
        "https://www.alibaba.com/product-detail/Custom-Logo-Baseball-Cap_1600123456789.html?spm=a2700.galleryofferlist.normal_offer",
      platform: "alibaba",
      productId: "1600123456789",
      canonicalUrl: "https://www.alibaba.com/product-detail/Custom-Logo-Baseball-Cap_1600123456789.html",
    },
    {
      input: "https://detail.1688.com/offer/712345678901.html?spm=a26352.13672862.offerlist",
      platform: "1688",
      productId: "712345678901",
      canonicalUrl: "https://detail.1688.com/offer/712345678901.html",
    },
    {
      input: "https://m.1688.com/offer/712345678902.html",
      platform: "1688",
      productId: "712345678902",
      canonicalUrl: "https://m.1688.com/offer/712345678902.html",
    },
  ])("recognises a $platform product page: $input", ({ input, platform, productId, canonicalUrl }) => {
    expect(parseSupplierUrl(input)).toEqual({ kind: "product", platform, productId, canonicalUrl });
  });

  it("ignores surrounding whitespace from a paste", () => {
    expect(parseSupplierUrl("  https://fr.aliexpress.com/item/1005006294811234.html\n")).toEqual({
      kind: "product",
      platform: "aliexpress",
      productId: "1005006294811234",
      canonicalUrl: "https://fr.aliexpress.com/item/1005006294811234.html",
    });
  });

  it("accepts a product address pasted without its scheme", () => {
    expect(parseSupplierUrl("fr.aliexpress.com/item/1005006294811234.html")).toEqual({
      kind: "product",
      platform: "aliexpress",
      productId: "1005006294811234",
      canonicalUrl: "https://fr.aliexpress.com/item/1005006294811234.html",
    });
  });
});

describe("parseSupplierUrl canonical URL", () => {
  it("removes tracking parameters and the fragment", () => {
    const result = parseSupplierUrl(
      "https://fr.aliexpress.com/item/1005006294811234.html?spm=a2g0o.home&gatewayAdapt=glo2fra&utm_source=newsletter#nav-specification",
    );
    expect(result).toMatchObject({ canonicalUrl: "https://fr.aliexpress.com/item/1005006294811234.html" });
  });

  it("keeps only goods_id among Temu query parameters, whatever its position", () => {
    const result = parseSupplierUrl(
      "https://www.temu.com/goods.html?_bg_fs=1&goods_id=601099527000001&utm_campaign=fr_q4&refer_page_sn=10005",
    );
    expect(result).toMatchObject({
      productId: "601099527000001",
      canonicalUrl: "https://www.temu.com/goods.html?goods_id=601099527000001",
    });
  });
});

describe("parseSupplierUrl short links", () => {
  it.each([
    "https://s.click.aliexpress.com/e/_DlXyZ12",
    "https://a.aliexpress.com/_mKabc12",
    "https://share.temu.com/AbCdEfGh12",
    "https://temu.to/k/abc123xyz",
  ])("refuses the short link %s", (input) => {
    expect(parseSupplierUrl(input)).toEqual({ kind: "short_link" });
  });
});

describe("parseSupplierUrl invalid input", () => {
  it.each([
    "javascript:alert(1)",
    "http://",
    "ftp://fr.aliexpress.com/item/1005006294811234.html",
    "data:text/html,<b>x</b>",
  ])("rejects %s as invalid", (input) => {
    expect(parseSupplierUrl(input).kind).toBe("invalid");
  });

  it.each([
    ["http://", "malformed"],
    ["javascript:alert(1)", "not_web"],
    ["ftp://fr.aliexpress.com/item/1005006294811234.html", "not_web"],
  ] as const)("gives %s the reason code %s", (input, reason) => {
    expect(parseSupplierUrl(input)).toMatchObject({ kind: "invalid", reason });
  });

  it.each([
    "https://fr.aliexpress.com/store/1102345678",
    "https://www.temu.com/fr/channel/best-sellers.html",
    "https://www.alibaba.com/showroom/baseball-cap.html",
    "https://detail.1688.com/offer/notanid.html",
  ])("rejects a supplier address that is not a product page: %s", (input) => {
    expect(parseSupplierUrl(input)).toMatchObject({ kind: "invalid", reason: "not_product" });
  });
});

describe("parseSupplierUrl text and other sites", () => {
  it.each([
    "casquette",
    "casquette noire en coton",
    "Pack : 3 paires de chaussettes",
    "v2.0",
    "",
    "https://www.amazon.fr/dp/B0ABC12345",
    "https://fakealiexpress.com/item/1005006294811234.html",
    "https://aliexpress.com.evil.example/item/1005006294811234.html",
  ])("treats %j as not a supplier URL", (input) => {
    expect(parseSupplierUrl(input)).toEqual({ kind: "not_a_supplier_url" });
  });
});
