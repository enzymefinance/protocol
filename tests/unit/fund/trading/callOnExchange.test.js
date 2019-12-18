/*
 * @file Tests funds trading via the mock adapter.
 * @dev This allows checking policies and other proprietary requirements without needing to satisfy exchange requirements
 *
 * @test Fund can NOT trade when maker or taker asset NOT in Registry
 * @test Fund can NOT TAKE order when TAKER fee asset NOT in Registry
 * @test Fund can TAKE order when MAKER fee asset NOT in Registry
 * @test Fund can NOT MAKE order when MAKER fee asset NOT in Registry
 * @test Fund can MAKE order when TAKER fee asset NOT in Registry
 */

import { encodeFunctionSignature } from 'web3-eth-abi';
import { BN, randomHex, toWei } from 'web3-utils';

import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { deploy } from '~/deploy/utils/deploy-contract';
import web3 from '~/deploy/utils/get-web3';

import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { stringToBytes } from '~/tests/utils/formatting';
import getFundComponents from '~/tests/utils/getFundComponents';
import { getFunctionSignature } from '~/tests/utils/metadata';

let defaultTxOpts, managerTxOpts;
let deployer, manager, investor;
let contracts, deployOut;
let exchangeIndex, makeOrderSignature, takeOrderSignature;
let weth, mln;
let fund;

beforeAll(async () => {
  const accounts = await web3.eth.getAccounts();
  [deployer, manager, investor] = accounts;
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  // Define vars - orders
  exchangeIndex = 0;
  makeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.EXCHANGE_ADAPTER,
    'makeOrder'
  );
  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.EXCHANGE_ADAPTER,
    'takeOrder'
  );
});

beforeEach(async () => {

  const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
  contracts = deployed.contracts;
  deployOut = deployed.deployOut;

  const registry = contracts.Registry;
  const version = contracts.Version;
  weth = contracts.WETH;
  mln = contracts.MLN;

  // Register a mock exchange and adapter
  const mockExchangeAddress = randomHex(20);
  const mockAdapter = await deploy(CONTRACT_NAMES.MOCK_ADAPTER);
  const takesCustody = false;
  const sigs = [
    encodeFunctionSignature(makeOrderSignature),
    encodeFunctionSignature(takeOrderSignature)
  ];
  await registry.methods
    .registerExchangeAdapter(
      mockExchangeAddress,
      mockAdapter.options.address,
      takesCustody,
      sigs
    )
    .send(defaultTxOpts);

  // Startup a fund
  await version.methods
    .beginSetup(
      stringToBytes('Test fund', 32),
      [],
      [],
      [],
      [mockExchangeAddress],
      [mockAdapter.options.address],
      weth.options.address.toString(),
      [mln.options.address.toString(), weth.options.address.toString()],
    ).send(managerTxOpts);

  await version.methods.createAccounting().send(managerTxOpts);
  await version.methods.createFeeManager().send(managerTxOpts);
  await version.methods.createParticipation().send(managerTxOpts);
  await version.methods.createPolicyManager().send(managerTxOpts);
  await version.methods.createShares().send(managerTxOpts);
  await version.methods.createTrading().send(managerTxOpts);
  await version.methods.createVault().send(managerTxOpts);
  const res = await version.methods.completeSetup().send(managerTxOpts);
  const hubAddress = res.events.NewFund.returnValues.hub;
  fund = await getFundComponents(hubAddress);

  // Seed investor with weth and invest in fund
  await weth.methods
    .transfer(investor, toWei('1', 'ether'))
    .send(defaultTxOpts);

  const investorTxOpts = { ...defaultTxOpts, from: investor };
  const offeredValue = toWei('1', 'ether');
  const wantedShares = toWei('1', 'ether');
  const amguAmount = toWei('.01', 'ether');
  await weth.methods
    .approve(fund.participation.options.address, offeredValue)
    .send(investorTxOpts);
  await fund.participation.methods
    .requestInvestment(offeredValue, wantedShares, weth.options.address)
    .send({ ...investorTxOpts, value: amguAmount });
  await fund.participation.methods
    .executeRequestFor(investor)
    .send(investorTxOpts);
});

describe('Asset in Registry', () => {
  it('can NOT trade when maker or taker asset NOT in Registry', async () => {
    const { trading } = fund;

    const makerQuantity = 100;
    const takerQuantity = 200;

    // Make orders
    await expect(
      trading.methods
        .callOnExchange(
          exchangeIndex,
          makeOrderSignature,
          [
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            randomHex(20),
            weth.options.address,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS
          ],
          [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
          ['0x0', '0x0', '0x0', '0x0'],
          '0x0',
          '0x0',
        )
        .send(managerTxOpts)
    ).rejects.toThrow("Maker asset not registered");

    await expect(
      trading.methods
        .callOnExchange(
          exchangeIndex,
          makeOrderSignature,
          [
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            weth.options.address,
            randomHex(20),
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS
          ],
          [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
          ['0x0', '0x0', '0x0', '0x0'],
          '0x0',
          '0x0',
        )
        .send(managerTxOpts)
    ).rejects.toThrow("Taker asset not registered");

    // Take orders
    await expect(
      trading.methods
        .callOnExchange(
          exchangeIndex,
          takeOrderSignature,
          [
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            randomHex(20),
            weth.options.address,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS
          ],
          [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
          ['0x0', '0x0', '0x0', '0x0'],
          '0x0',
          '0x0',
        )
        .send(managerTxOpts)
    ).rejects.toThrow("Maker asset not registered");

    await expect(
      trading.methods
        .callOnExchange(
          exchangeIndex,
          takeOrderSignature,
          [
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            weth.options.address,
            randomHex(20),
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS
          ],
          [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
          ['0x0', '0x0', '0x0', '0x0'],
          '0x0',
          '0x0',
        )
        .send(managerTxOpts)
    ).rejects.toThrow("Taker asset not registered");
  });

  it('can NOT MAKE order when MAKER fee asset NOT in Registry', async () => {
    const { trading } = fund;

    const makerQuantity = 100;
    const takerQuantity = 200;

    await expect(
      trading.methods
        .callOnExchange(
          exchangeIndex,
          makeOrderSignature,
          [
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            weth.options.address,
            mln.options.address,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            randomHex(20),
            EMPTY_ADDRESS
          ],
          [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
          ['0x0', '0x0', '0x0', '0x0'],
          '0x0',
          '0x0',
        )
        .send(managerTxOpts)
    ).rejects.toThrow("Maker fee asset not registered");
  });

  it('can MAKE order when TAKER fee asset NOT in Registry', async () => {
    const { trading } = fund;

    const makerQuantity = 100;
    const takerQuantity = 200;

    // Take order
    await expect(
      trading.methods
        .callOnExchange(
          exchangeIndex,
          makeOrderSignature,
          [
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            weth.options.address,
            mln.options.address,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            mln.options.address,
            randomHex(20)
          ],
          [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
          ['0x0', '0x0', '0x0', '0x0'],
          '0x0',
          '0x0',
        )
        .send(managerTxOpts)
    ).resolves.not.toThrow();
  });

  it('can NOT TAKE order when TAKER fee asset NOT in Registry', async () => {
    const { trading } = fund;

    const makerQuantity = 100;
    const takerQuantity = 200;

    await expect(
      trading.methods
        .callOnExchange(
          exchangeIndex,
          takeOrderSignature,
          [
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            weth.options.address,
            mln.options.address,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            randomHex(20),
          ],
          [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
          ['0x0', '0x0', '0x0', '0x0'],
          '0x0',
          '0x0',
        )
        .send(managerTxOpts)
    ).rejects.toThrow("Taker fee asset not registered");
  });

  it('can TAKE order when MAKER fee asset NOT in Registry', async () => {
    const { trading } = fund;

    const makerQuantity = 100;
    const takerQuantity = 200;

    // Take order
    await expect(
      trading.methods
        .callOnExchange(
          exchangeIndex,
          takeOrderSignature,
          [
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            weth.options.address,
            mln.options.address,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            randomHex(20),
            weth.options.address
          ],
          [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
          ['0x0', '0x0', '0x0', '0x0'],
          '0x0',
          '0x0',
        )
        .send(managerTxOpts)
    ).resolves.not.toThrow();
  });
});
