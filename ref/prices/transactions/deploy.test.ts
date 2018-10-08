import initGlobalEnvironment from "~/utils/environment/initGlobalEnvironment";

import deploy from "./deploy";

const shared: any = {};

beforeAll(async () => {
  initGlobalEnvironment({
    wallet: { address: "0x92b9eF5F9AA18823381AEb80EFfc5103Bc103f10" }
  });
  shared.quoteToken = {
    symbol: "ETH",
    address: "0xf9Df6AEc03A59503AD596B9AB68b77dc2937F69D",
    decimals: 18
  };
});

test("deploy", async () => {
  const address = await deploy(shared.quoteToken);
  expect(address).toBeTruthy();
});

test("deploy with wrong address", async () => {
  await expect(
    deploy({ symbol: "BADADDR", address: "0xqwer", decimals: 2 })
  ).rejects.toThrow();
});
