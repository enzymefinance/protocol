import { Price, Quantity, Token } from "@melonproject/token-math";

import initTestEnvironment from "~/utils/environment/initTestEnvironment";

import update from "./update";
import deploy from "./deploy";

const shared: any = {};

beforeAll(async () => {
  await initTestEnvironment();
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
  const newPrice = Price.getPrice(
    Quantity.createQuantity(
      shared.mlnToken,
      Token.appendDecimals(shared.mlnToken, 1)
    ),
    Quantity.createQuantity(
      shared.quoteToken,
      Token.appendDecimals(shared.quoteToken, 0.34)
    )
  );

  const receipt = await update(shared.address, [newPrice]);

  expect(Price.isEqual(receipt[0], newPrice)).toBe(true);
});
