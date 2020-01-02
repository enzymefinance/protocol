import { BN, toWei } from 'web3-utils';
import { BNExpDiv, BNExpInverse } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { deploy } from '~/deploy/utils/deploy-contract';
import web3 from '~/deploy/utils/get-web3';

describe('kyber-price-feed', () => {
  let deployerTxOpts;
  let conversionRates, kyberPriceFeed, kyberNetworkProxy, mockRegistry;
  let deployer, updater;
  let eur, mln, weth;

  beforeAll(async () => {
    const accounts = await web3.eth.getAccounts();
    [deployer, updater] = accounts;
    deployerTxOpts = { from: deployer, gas: 8000000 };
    const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
    const contracts = deployed.contracts;

    eur = contracts.EUR;
    mln = contracts.MLN;
    weth = contracts.WETH;
    conversionRates = contracts.ConversionRates;
    kyberNetworkProxy = contracts.KyberNetworkProxy;

    mockRegistry = await deploy(CONTRACT_NAMES.MOCK_REGISTRY, [], deployerTxOpts);

    kyberPriceFeed = await deploy(
      CONTRACT_NAMES.KYBER_PRICEFEED,
      [
        mockRegistry.options.address,
        kyberNetworkProxy.options.address,
        toWei('0.5', 'ether'),
        weth.options.address,
        updater
      ],
      deployerTxOpts
    );
    await mockRegistry.methods
      .setNativeAsset(weth.options.address)
      .send(deployerTxOpts);

    for (const addr of [eur.options.address, mln.options.address, weth.options.address]) {
      await mockRegistry.methods
        .register(addr)
        .send(deployerTxOpts);
    }
  });

  it('Registry owner updates pricefeed', async () => {
    const registryOwner = await mockRegistry.methods.owner().call();

    expect(registryOwner).toBe(deployer);

    await kyberPriceFeed.methods.update().send({from: deployer, gas: 8000000});
    const hasValidMlnPrice = await kyberPriceFeed.methods
      .hasValidPrice(mln.options.address)
      .call();

    expect(hasValidMlnPrice).toBe(true);

    const { 0: mlnPrice } = await kyberPriceFeed.methods
      .getPrice(mln.options.address)
      .call();

    expect(mlnPrice.toString()).toBe(toWei('1', 'ether'));
  });

  it('MLN price is changed in reserve, and Updater updates', async () => {
    const listedUpdater = await kyberPriceFeed.methods.UPDATER().call();

    expect(listedUpdater).toBe(updater);

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
      ).send(deployerTxOpts);

    await kyberPriceFeed.methods.update().send({from: updater, gas: 8000000});

    const { 0: updatedMlnPrice } = await kyberPriceFeed.methods
      .getPrice(mln.options.address).call();

    const { 0: updatedEurPrice } = await kyberPriceFeed.methods
      .getPrice(eur.options.address).call();

    expect(updatedMlnPrice.toString()).toBe(mlnPrice.toString());
    expect(updatedEurPrice.toString()).toBe(eurPrice.toString());
  });
 
  it('Normal (positive) spread condition yields midpoint price', async () => {
    const mlnBid = BNExpDiv(
      new BN(toWei('1', 'ether')),
      new BN(toWei('0.05', 'ether'))
    );
    const mlnAsk = BNExpDiv(
      new BN(toWei('1', 'ether')),
      new BN(toWei('0.04', 'ether'))
    );
    const ethBidInMln = BNExpInverse(mlnBid); // ETH per 1 MLN (based on bid)

    const blockNumber = (await web3.eth.getBlock('latest')).number;
    await conversionRates.methods
      .setBaseRate(
        [mln.options.address],
        [ethBidInMln.toString()],
        [mlnAsk.toString()],
        ['0x0000000000000000000000000000'],
        ['0x0000000000000000000000000000'],
        blockNumber,
        [0]
      ).send(deployerTxOpts);

    await kyberPriceFeed.methods.update().send(deployerTxOpts);

    const mlnPrice = await kyberPriceFeed.methods.getPrice(
      mln.options.address
    ).call();
    const midpointPrice = BNExpDiv(
      mlnBid.add(mlnAsk), new BN(toWei('2', 'ether'))
    ).toString();
    expect(mlnPrice.price).toBe(midpointPrice);
  });

  it('Crossed market condition yields midpoint price', async () => {
    const mlnBid = BNExpDiv(
      new BN(toWei('1', 'ether')),
      new BN(toWei('0.04', 'ether'))
    );
    const mlnAsk = BNExpDiv(
      new BN(toWei('1', 'ether')),
      new BN(toWei('0.05', 'ether'))
    );
    const ethBidInMln = BNExpInverse(mlnBid); // ETH per 1 MLN (based on bid)

    const blockNumber = (await web3.eth.getBlock('latest')).number;
    await conversionRates.methods
      .setBaseRate(
        [mln.options.address],
        [ethBidInMln.toString()],
        [mlnAsk.toString()],
        ['0x0000000000000000000000000000'],
        ['0x0000000000000000000000000000'],
        blockNumber,
        [0]
      ).send(deployerTxOpts);

    await kyberPriceFeed.methods.update().send(deployerTxOpts);
 
    const mlnPrice = await kyberPriceFeed.methods.getPrice(
      mln.options.address
    ).call();

    const midpointPrice = BNExpDiv(
      mlnBid.add(mlnAsk), new BN(toWei('2', 'ether'))
    ).toString();
    expect(mlnPrice.price).toBe(midpointPrice);
  });
});
