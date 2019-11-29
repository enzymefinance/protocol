import { encodeFunctionSignature } from 'web3-eth-abi';
import { BN, toWei } from 'web3-utils';

import { deployAndInitTestEnv } from '~/tests/utils/deployAndInitTestEnv';
import { setupInvestedTestFund } from '~/tests/utils/setupInvestedTestFund';
import { deployContract } from '~/utils/solidity/deployContract';
import { getContract } from '~/utils/solidity/getContract';

import { CONTRACT_NAMES } from '~/tests/utils/new/constants';
import { BNExpMul } from '~/tests/utils/new/BNMath';

let environment;
let deployer, manager, investor1, investor2, investor3;
let defaultTxOpts, managerTxOpts;
let investor1TxOpts, investor2TxOpts, investor3TxOpts;
let addresses, contracts;
let daiToEthRate, mlnToEthRate, wethToEthRate;

beforeAll(async () => {
  environment = await deployAndInitTestEnv();
  [
    deployer,
    manager,
    investor1,
    investor2,
    investor3
  ] = await environment.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investor1TxOpts = { ...defaultTxOpts, from: investor1 };
  investor2TxOpts = { ...defaultTxOpts, from: investor2 };
  investor3TxOpts = { ...defaultTxOpts, from: investor3 };

  addresses = environment.deployment;

  const dai = getContract(
    environment,
    CONTRACT_NAMES.STANDARD_TOKEN,
    addresses.thirdPartyContracts.tokens.find(
      token => token.symbol === 'DAI'
    ).address
  );
  const mln = getContract(
    environment,
    CONTRACT_NAMES.BURNABLE_TOKEN,
    addresses.thirdPartyContracts.tokens.find(
      token => token.symbol === 'MLN'
    ).address
  );
  const priceSource = getContract(
    environment,
    CONTRACT_NAMES.TESTING_PRICEFEED,
    addresses.melonContracts.priceSource
  );
  const weth = getContract(
    environment,
    CONTRACT_NAMES.WETH,
    addresses.thirdPartyContracts.tokens.find(
      token => token.symbol === 'WETH'
    ).address
  );
  contracts = { dai, mln, priceSource, weth };

  // Set initial prices to be predictably the same as prices when updated again later
  wethToEthRate = toWei('1', 'ether');
  mlnToEthRate = toWei('0.5', 'ether');
  daiToEthRate = toWei('0.005', 'ether');

  await priceSource.methods
    .update(
      [weth.options.address, mln.options.address, dai.options.address],
      [wethToEthRate, mlnToEthRate, daiToEthRate],
    )
    .send(defaultTxOpts);

  await weth.methods.transfer(investor1, toWei('10', 'ether')).send(defaultTxOpts);
  await weth.methods.transfer(investor2, toWei('10', 'ether')).send(defaultTxOpts);
  await weth.methods.transfer(investor3, toWei('10', 'ether')).send(defaultTxOpts);
  await mln.methods.transfer(investor1, toWei('20', 'ether')).send(defaultTxOpts);
  await mln.methods.transfer(investor2, toWei('20', 'ether')).send(defaultTxOpts);
  await mln.methods.transfer(investor3, toWei('20', 'ether')).send(defaultTxOpts);
  await dai.methods.transfer(investor1, toWei('2000', 'ether')).send(defaultTxOpts);
  await dai.methods.transfer(investor2, toWei('2000', 'ether')).send(defaultTxOpts);
  await dai.methods.transfer(investor3, toWei('2000', 'ether')).send(defaultTxOpts);
});

describe('Fund 1: Multiple investors buying shares with different tokens', () => {
  let fundAddresses, fundContracts, policyContracts;
  let amguAmount, shareSlippageTolerance;
  let wantedShares1, wantedShares2, wantedShares3;

  beforeAll(async () => {
    fundAddresses = await setupInvestedTestFund(environment);

    const accounting = getContract(
      environment,
      CONTRACT_NAMES.ACCOUNTING,
      fundAddresses.accountingAddress
    );
    const participation = getContract(
      environment,
      CONTRACT_NAMES.PARTICIPATION,
      fundAddresses.participationAddress
    );
    const shares = getContract(
      environment,
      CONTRACT_NAMES.SHARES,
      fundAddresses.sharesAddress
    );
    fundContracts = { accounting, participation, shares };

    amguAmount = toWei('.01', 'ether');
    wantedShares1 = toWei('1', 'ether');
    wantedShares2 = toWei('2', 'ether');
    wantedShares3 = toWei('1.5', 'ether');
    shareSlippageTolerance = new BN(toWei('0.0001', 'ether')); // 0.01%
  });

  test('A user can have only one pending investment request', async () => {
    const { mln, weth } = contracts;
    const { accounting, participation, } = fundContracts;

    const offerAsset = weth.options.address;
    const expectedOfferAssetCost = new BN(
      await accounting.methods
        .getShareCostInAsset(wantedShares1, offerAsset)
        .call()
    );
    const offerAssetMaxQuantity = BNExpMul(
      expectedOfferAssetCost,
      new BN(toWei('1', 'ether')).add(shareSlippageTolerance)
    ).toString();

    // Investor 1 - weth
    await weth.methods
      .approve(participation.options.address, offerAssetMaxQuantity)
      .send(investor1TxOpts);
    await participation.methods
      .requestInvestment(wantedShares1, offerAssetMaxQuantity, offerAsset)
      .send({ ...investor1TxOpts, value: amguAmount });

    // Investor 1 - weth
    await weth.methods
      .approve(participation.options.address, offerAssetMaxQuantity)
      .send(investor1TxOpts);
    await expect(
      participation.methods
        .requestInvestment(wantedShares1, offerAssetMaxQuantity, offerAsset)
        .send({ ...investor1TxOpts, value: amguAmount })
    ).rejects.toThrow("Only one request can exist at a time");
  });

  test('Investment request allowed for second user with another default token', async () => {
    const { mln } = contracts;
    const { accounting, participation } = fundContracts;

    const offerAsset = mln.options.address;
    const expectedOfferAssetCost = new BN(
      await accounting.methods
        .getShareCostInAsset(wantedShares2, offerAsset)
        .call()
    );
    const offerAssetMaxQuantity = BNExpMul(
      expectedOfferAssetCost,
      new BN(toWei('1', 'ether')).add(shareSlippageTolerance)
    ).toString();

    // Investor 2 - mln
    await mln.methods
      .approve(participation.options.address, offerAssetMaxQuantity)
      .send(investor2TxOpts);
    await participation.methods
      .requestInvestment(wantedShares2, offerAssetMaxQuantity, offerAsset)
      .send({ ...investor2TxOpts, value: amguAmount });
  });

  test('Investment request allowed for third user with approved token', async () => {
    const { dai } = contracts;
    const { accounting, participation } = fundContracts;

    const offerAsset = dai.options.address;
    const expectedOfferAssetCost = new BN(
      await accounting.methods
        .getShareCostInAsset(wantedShares3, offerAsset)
        .call()
    );
    const offerAssetMaxQuantity = BNExpMul(
      expectedOfferAssetCost,
      new BN(toWei('1', 'ether')).add(shareSlippageTolerance)
    ).toString();

    // Investor 3 - dai
    await dai.methods
      .approve(participation.options.address, offerAssetMaxQuantity)
      .send(investor3TxOpts);
    await expect(
      participation.methods
        .requestInvestment(wantedShares3, offerAssetMaxQuantity, offerAsset)
        .send({ ...investor3TxOpts, value: amguAmount })
    ).rejects.toThrow();

    await participation.methods
      .enableInvestment([offerAsset])
      .send(defaultTxOpts);

    await participation.methods
      .requestInvestment(wantedShares3, offerAssetMaxQuantity, offerAsset)
      .send({ ...investor3TxOpts, value: amguAmount });
  });

  test('Multiple pending investments can be executed', async () => {
    const { dai, mln, priceSource, weth } = contracts;
    const { participation, shares } = fundContracts;

    // Need price update before participation executed
    environment.eth.currentProvider.send(
      {
        id: 121,
        jsonrpc: '2.0',
        method: 'evm_increaseTime',
        params: [30], // 30 secs
      },
      (err, res) => {},
    );
    await priceSource.methods
      .update(
        [weth.options.address, mln.options.address, dai.options.address],
        [wethToEthRate, mlnToEthRate, daiToEthRate],
      )
      .send(defaultTxOpts);

    await participation.methods
      .executeRequestFor(investor1)
      .send(investor1TxOpts);
    const investor1Shares = await shares.methods.balanceOf(investor1).call();
    expect(investor1Shares).toEqual(wantedShares1);

    await participation.methods
      .executeRequestFor(investor2)
      .send(investor2TxOpts);
    const investor2Shares = await shares.methods.balanceOf(investor2).call();
    expect(investor2Shares).toEqual(wantedShares2);

    await participation.methods
      .executeRequestFor(investor3)
      .send(investor3TxOpts);
    const investor3Shares = await shares.methods.balanceOf(investor3).call();
    expect(investor3Shares).toEqual(wantedShares3);
  });
});
