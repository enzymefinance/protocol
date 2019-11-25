import { BN, toWei } from 'web3-utils';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { deployToken } from '~/contracts/dependencies/token/transactions/deploy';
import { isAddress } from '~/utils/checks/isAddress';
import { deployContract } from '~/utils/solidity/deployContract';
import { getContract } from '~/utils/solidity/getContract';
import { BNExpDiv, BNExpInverse } from '../utils/new/BNmath';
import { CONTRACT_NAMES } from '../utils/new/constants';
const getFundComponents = require('../utils/new/getFundComponents');
const updateTestingPriceFeed = require('../utils/new/updateTestingPriceFeed');
const increaseTime = require('../utils/new/increaseTime');
const getAllBalances = require('../utils/new/getAllBalances');
const {deploy, fetchContract} = require('../../../new/deploy/deploy-contract');
const web3 = require('../../../new/deploy/get-web3');
const deploySystem = require('../../../new/deploy/deploy-system');

describe('kyber-price-feed', () => {
  let user, defaultTxOpts;
  let conversionRates, kyberPriceFeed, kyberNetworkProxy, mockRegistry;
  let eur, mln, weth;

  beforeAll(async () => {
    const accounts = await web3.eth.getAccounts();
    user = accounts[0];
    defaultTxOpts = { from: user, gas: 8000000 };
    const deployment = await deploySystem(JSON.parse(require('fs').readFileSync(process.env.CONF))); // TODO: change from reading file each time
    const contracts = deployment.contracts;

    eur = contracts.EUR;
    mln = contracts.MLN;
    weth = contracts.WETH;
    conversionRates = contracts.ConversionRates;
    kyberNetworkProxy = contracts.KyberNetworkProxy;

    mockRegistry = await deploy(CONTRACT_NAMES.MOCK_REGISTRY);

    kyberPriceFeed = await deploy(
      CONTRACT_NAMES.KYBER_PRICEFEED, 
      [
        mockRegistry.options.address,
        kyberNetworkProxy.options.address,
        toWei('0.5', 'ether'),
        weth.options.address
      ]
    );
    await mockRegistry.methods
      .setNativeAsset(weth.options.address)
      .send(defaultTxOpts);

    for (const addr of [eur.options.address, mln.options.address, weth.options.address]) {
      await mockRegistry.methods
        .register(addr)
        .send(defaultTxOpts);
    }
    await kyberPriceFeed.methods.update().send(defaultTxOpts);
  });

  // TODO: not getting price here, but it seems to work after the test is finished
  it('Get price', async () => {
    console.log(kyberPriceFeed.options.address)
    console.log(mln.options.address)
    const hasValidMlnPrice = await kyberPriceFeed.methods
      .hasValidPrice(mln.options.address)
      .call();

    expect(hasValidMlnPrice).toBe(true);

    const { 0: mlnPrice } = await kyberPriceFeed.methods
      .getPrice(mln.options.address)
      .call();

    expect(mlnPrice.toString()).toBe(toWei('1', 'ether'));
  });

  it('Update mln price in reserve', async () => {
    const mlnPrice = BNExpDiv(
      new BN(toWei('1', 'ether')),
      new BN(toWei('0.05', 'ether'))
    );
    const ethPriceInMln = BNExpInverse(new BN(mlnPrice))

    const eurPrice = BNExpDiv(
      new BN(toWei('1', 'ether')),
      new BN(toWei('0.008', 'ether')),
    );
    const ethPriceInEur = BNExpInverse(new BN(eurPrice))

    const blockNumber = (await web3.eth.getBlock('latest')).number;
    await conversionRates.methods
      .setBaseRate(
        [mln.options.address, eur.options.address],
        [ethPriceInMln.toString(), ethPriceInEur.toString()],
        [mlnPrice.toString(), eurPrice.toString()],
        ['0x0000000000000000000000000000'],
        ['0x0000000000000000000000000000'],
        blockNumber,
        [0]
      ).send(defaultTxOpts);

    await kyberPriceFeed.methods.update().send(defaultTxOpts);

    const { 0: updatedMlnPrice } = await kyberPriceFeed.methods
      .getPrice(mln.options.address).call();

    const { 0: updatedEurPrice } = await kyberPriceFeed.methods
      .getPrice(eur.options.address).call();

    expect(updatedMlnPrice.toString()).toBe(mlnPrice.toString());
    expect(updatedEurPrice.toString()).toBe(eurPrice.toString());
  });
});
