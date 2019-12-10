import { toWei, randomHex } from 'web3-utils';

import web3 from '~/deploy/utils/get-web3';

import { CONTRACT_NAMES } from '~/tests/utils/constants';
import deployMockSystem from '~/tests/utils/deployMockSystem';
import { increaseTime } from '~/tests/utils/rpc';

const weekInSeconds = 60 * 60 * 24 * 7;

describe('investment', () => {
  let user, defaultTxOpts;
  let mockSystem;
  let defaultAmgu;

  beforeAll(async () => {
    const accounts = await web3.eth.getAccounts();
    user = accounts[0];
    defaultTxOpts = { from: user, gas: 8000000 };

    mockSystem = await deployMockSystem(
      {accountingContract: CONTRACT_NAMES.ACCOUNTING}
    );

    defaultAmgu = toWei('0.01', 'ether');

    const price = toWei('1', 'ether');
    await mockSystem.priceSource.methods
      .update(
        [mockSystem.weth.options.address, mockSystem.mln.options.address],
        [price, price],
      )
      .send(defaultTxOpts);

    await mockSystem.registry.methods
      .setIsFund(mockSystem.participation.options.address)
      .send(defaultTxOpts);
  });

  it('Invest fails in shut down fund', async () => {
    const errorMessage = 'Hub is shut down';
    const amount = toWei('1', 'ether');
    await mockSystem.hub.methods.setShutDownState(true).send(defaultTxOpts);

    await expect(
      mockSystem.participation.methods
        .requestInvestment(amount, amount, mockSystem.weth.options.address)
        .send(defaultTxOpts)
    ).rejects.toThrow(errorMessage);

    await mockSystem.hub.methods.setShutDownState(false).send(defaultTxOpts);
    await mockSystem.weth.methods
      .approve(mockSystem.participation.options.address, amount)
      .send(defaultTxOpts);
    await mockSystem.participation.methods
      .requestInvestment(amount, amount, mockSystem.weth.options.address)
      .send({ ...defaultTxOpts, value: defaultAmgu });

    await mockSystem.hub.methods.setShutDownState(true).send(defaultTxOpts);

    await expect(
      mockSystem.participation.methods
        .executeRequestFor(user)
        .send(defaultTxOpts)
    ).rejects.toThrow(errorMessage);

    await mockSystem.hub.methods.setShutDownState(false).send(defaultTxOpts);

    await increaseTime(weekInSeconds);

    await mockSystem.participation.methods
      .cancelRequest()
      .send({ ...defaultTxOpts, value: defaultAmgu });
  });

  it('Request must exist to execute', async () => {
    const errorMessage = 'No valid request for this address';
    const requestExists = await mockSystem.participation.methods
      .hasRequest(user)
      .call();

    expect(requestExists).toBe(false);
    await expect(
      mockSystem.participation.methods
        .executeRequestFor(user)
        .send(defaultTxOpts)
    ).rejects.toThrow(errorMessage);

    await mockSystem.participation.methods
      .requestInvestment(0, 0, mockSystem.weth.options.address)
      .send({ ...defaultTxOpts, value: defaultAmgu });

    await expect(
      mockSystem.participation.methods
        .executeRequestFor(user)
        .send(defaultTxOpts)
    ).rejects.toThrow(errorMessage);

    // Increment next block time and mine block
    await increaseTime(weekInSeconds);

    await mockSystem.participation.methods
      .cancelRequest()
      .send({ ...defaultTxOpts, value: defaultAmgu });
  });

  it('Need fresh price to execute request', async () => {
    const errorMessage = 'Price not valid';
    const amount = toWei('1', 'ether');

    await mockSystem.priceSource.methods
      .setNeverValid(true)
      .send(defaultTxOpts);

    await mockSystem.weth.methods
      .approve(mockSystem.participation.options.address, amount)
      .send(defaultTxOpts);
    await mockSystem.participation.methods
      .requestInvestment(amount, amount, mockSystem.weth.options.address)
      .send({ ...defaultTxOpts, value: defaultAmgu });
    const requestExists = await mockSystem.participation.methods
      .hasRequest(user)
      .call();

    expect(requestExists).toBe(true);
    await expect(
      mockSystem.participation.methods
        .executeRequestFor(user)
        .send(defaultTxOpts)
    ).rejects.toThrow(errorMessage);

    await mockSystem.priceSource.methods
      .setNeverValid(false)
      .send(defaultTxOpts);

    // Increment next block time and mine block
    await increaseTime(weekInSeconds);

    await mockSystem.participation.methods
      .cancelRequest()
      .send({ ...defaultTxOpts, value: defaultAmgu })
  });

  it('Asset must be permitted', async () => {
    const errorMessage = 'Investment not allowed in this asset';
    const asset = randomHex(20);
    const amount = '100';
    const allowed = await mockSystem.participation.methods
      .investAllowed(asset)
      .call();

    expect(allowed).toBe(false);

    await expect(
      mockSystem.participation.methods
        .requestInvestment(amount, amount, asset)
        .send({ ...defaultTxOpts, value: defaultAmgu })
    ).rejects.toThrow(errorMessage);
  });

  it('Invested amount must be above price minimum', async () => {
    const errorMessage = 'Invested amount too low';
    const price = toWei('1', 'ether');
    await mockSystem.priceSource.methods
      .update(
        [mockSystem.weth.options.address, mockSystem.mln.options.address],
        [price, price],
      )
      .send(defaultTxOpts);
    await mockSystem.weth.methods
      .approve(mockSystem.participation.options.address, '1000')
      .send(defaultTxOpts);
    await mockSystem.participation.methods
      .requestInvestment('1000', '1', mockSystem.weth.options.address)
      .send({ ...defaultTxOpts, value: defaultAmgu });

    await expect(
      mockSystem.participation.methods
        .executeRequestFor(user)
        .send({ ...defaultTxOpts, value: defaultAmgu })
    ).rejects.toThrow(errorMessage);

    // Increment next block time and mine block
    await increaseTime(weekInSeconds);

    await mockSystem.participation.methods
      .cancelRequest()
      .send({ ...defaultTxOpts, value: defaultAmgu });
  });

  it('Basic investment works', async () => {
    const investAmount = '1000';
    const sharesAmount = '1000';
    const preVaultWeth = await mockSystem.weth.methods
      .balanceOf(mockSystem.vault.options.address)
      .call();
    await mockSystem.weth.methods
      .approve(mockSystem.participation.options.address, investAmount)
      .send(defaultTxOpts);
    await mockSystem.participation.methods
      .requestInvestment(
        sharesAmount,
        investAmount,
        mockSystem.weth.options.address,
      )
      .send({ ...defaultTxOpts, value: defaultAmgu });
    await mockSystem.participation.methods
      .executeRequestFor(user)
      .send({ ...defaultTxOpts, value: defaultAmgu });
    const postVaultWeth = await mockSystem.weth.methods
      .balanceOf(mockSystem.vault.options.address)
      .call();
    const postShares = await mockSystem.shares.methods
      .balanceOf(user)
      .call();
    const postSupply = await mockSystem.shares.methods.totalSupply().call();

    expect(postShares).toEqual(sharesAmount);
    expect(postSupply).toEqual(sharesAmount);
    expect(Number(postVaultWeth)).toEqual(
      Number(preVaultWeth) + Number(investAmount),
    );
  });
});
