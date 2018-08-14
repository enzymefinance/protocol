const BigNumber = require("bignumber.js");

function getDiscountedPrices(prices, discountMultiplier) {
  const discountedPrices = {};

  if (discountMultiplier > 0.5) {
    throw new Error("Discount multiplier is too high");
  }

  for (const i of Object.keys(prices)) {
    const originalBuyPrice = new BigNumber(prices[i].buyPrice);
    const originalSellPrice = new BigNumber(prices[i].sellPrice);
    discountedPrices[i] = {
      buyPrice: new BigNumber(originalBuyPrice
        .sub(originalBuyPrice.mul(discountMultiplier))
        .toFixed(0)),
      sellPrice: new BigNumber(originalSellPrice
        .sub(originalSellPrice.mul(discountMultiplier))
        .toFixed(0)),
    };
  }
  return discountedPrices;
}

export default getDiscountedPrices;
