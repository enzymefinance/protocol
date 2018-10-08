import { price, quantity, token } from "@melonproject/token-math";

import initGlobalEnvironment from "~/utils/environment/initGlobalEnvironment";

import update from "./update";
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
  shared.mlnToken = {
    symbol: "MLN",
    address: "0x50E2a5cC79B7B281103E65F1308C3a928aa91515",
    decimals: 18
  };

  shared.address = await deploy(shared.quoteToken);
});

test("update", async () => {
  const receipt = await update(
    quantity.createQuantity(
      shared.quoteToken,
      token.appendDecimals(shared.quoteToken, 1)
    )
  );
});
