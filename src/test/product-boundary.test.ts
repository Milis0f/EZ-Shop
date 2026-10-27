import path from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const eslint = new ESLint({ cwd: root });

async function restrictedImports(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: path.join(root, file) });
  return result.messages.filter((m) => m.ruleId === "no-restricted-imports").map((m) => m.message);
}

describe("product code cannot reach the test fixtures", () => {
  it.each([
    ['import { createMockProviderSet } from "@/test/mock-providers";'],
    ['import { TEST_NOW } from "@/test/fixtures";'],
    ['import { createMockProviders } from "../../test/mock-providers/mock-providers";'],
  ])("refuses %s in src/server", async (code) => {
    const messages = await restrictedImports("src/server/services-probe.ts", `${code}\nexport const probe = 1;\n`);
    expect(messages).toEqual([expect.stringContaining("must not import src/test/")]);
  });

  it("allows the same import from a test file", async () => {
    const code = 'import { createMockProviderSet } from "@/test/mock-providers";\nexport const probe = createMockProviderSet;\n';
    expect(await restrictedImports("src/server/services-probe.test.ts", code)).toEqual([]);
  });
}, 60_000);
