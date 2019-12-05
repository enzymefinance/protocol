import { toWei, BN } from 'web3-utils';

import web3 from '~/../deploy/utils/get-web3';
import { partialRedeploy } from '~/../deploy/scripts/deploy-system';

import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { stringToBytes } from '~/tests/utils/formatting';
import getFundComponents from '~/tests/utils/getFundComponents';

describe('amgu', () => {
  let user, defaultTxOpts;
  let baseToken, quoteToken;
  let engine, version, priceSource, registry;
  let amguPrice, oldAmguPrice;
  let fundName;

  beforeAll(async () => {
    const accounts = await web3.eth.getAccounts();
    user = accounts[0];
    defaultTxOpts = { from: user, gas: 8000000 };

    const deployed = await partialRedeploy([
      CONTRACT_NAMES.VERSION,
      CONTRACT_NAMES.ENGINE
    ]);
    const contracts = deployed.contracts;

    engine = contracts.Engine;
    version = contracts.Version;
    registry = contracts.Registry;
    priceSource = contracts.TestingPriceFeed;

    // [quoteToken, baseToken] = thirdPartyContracts.tokens;
    quoteToken = contracts.WETH;
    baseToken = contracts.MLN;

    oldAmguPrice = await engine.methods.getAmguPrice().call();
    amguPrice = '1000000000';
    fundName = `test-fund-${Date.now()}`;
  });

  it('Set amgu and check its usage', async () => {
    await engine.methods
      .setAmguPrice(amguPrice)
      .send(defaultTxOpts)
    const newAmguPrice = await engine.methods.getAmguPrice().call();

    expect(newAmguPrice.toString()).toBe(amguPrice.toString());

    const newPrice = toWei('2', 'ether');
    await priceSource.methods
      .update([baseToken.options.address], [newPrice])
      .send(defaultTxOpts)

    const price = await priceSource.methods
      .getPrices([baseToken.options.address])
      .call();

    expect(price[0][0].toString()).toBe(newPrice.toString());

    await version.methods
      .beginSetup(
        stringToBytes(fundName, 32),
        [],
        [],
        [],
        [],
        [],
        quoteToken.options.address,
        [baseToken.options.address, quoteToken.options.address]
      ).send(defaultTxOpts);

    const amguTx = version.methods.createAccounting();

    const preUserBalance = await web3.eth.getBalance(user);
    const result = await amguTx.send({ ...defaultTxOpts, value: toWei('1', 'ether') });
    const postUserBalance = await web3.eth.getBalance(user);

    const gasPrice = await web3.eth.getGasPrice();
    const gasUsed = result.gasUsed;

    const nativeAssetAddress = await registry.methods.nativeAsset().call();
    const mlnAddress = await version.methods.mlnToken().call();

    const mlnAmount = new BN(amguPrice).mul(new BN(gasUsed));
    const ethToPay = await priceSource.methods.convertQuantity(
      mlnAmount.toString(),
      mlnAddress,
      nativeAssetAddress,
    ).call();

    const txCostInWei = new BN(gasPrice).mul(new BN(gasUsed));
    const totalUserCost = new BN(ethToPay).add(new BN(txCostInWei))
    const realUserCost = new BN(preUserBalance).sub(new BN(postUserBalance));

    expect(txCostInWei.lt(realUserCost)).toBe(true);
    expect(totalUserCost.gt(realUserCost)).toBe(true);
  });
});
