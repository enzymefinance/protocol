import { BN, toWei } from 'web3-utils';

import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { deployContract } from '~/utils/solidity/deployContract';
import { getContract } from '~/utils/solidity/getContract';

import { BNExpDiv } from '~/tests/utils/new/BNmath';
import { CONTRACT_NAMES } from '~/tests/utils/new/constants';


describe('prices-unit-tests', () => {
  let environment, user, defaultTxOpts;
  let mlnAddress, wethAddress;
  let priceSource;

  beforeAll(async () => {
    environment = await initTestEnvironment();
    user = environment.wallet.address;
    defaultTxOpts = { from: user, gas: 8000000 };

    wethAddress = await deployContract(
      environment,
      CONTRACT_NAMES.PREMINED_TOKEN,
      ['WETH', 18, '']
    );

    mlnAddress = await deployContract(
      environment,
      CONTRACT_NAMES.BURNABLE_TOKEN,
      ['MLN', 18, '']
    );

    priceSource = await getContract(
      environment,
      CONTRACT_NAMES.TESTING_PRICEFEED,
      await deployContract(
        environment,
        CONTRACT_NAMES.TESTING_PRICEFEED,
        [wethAddress.toString(), 18]
      )
    );
  });

  it('price updates', async () => {
    const mlnToWeth = BNExpDiv(
      new BN(toWei('1', 'ether')),
      new BN(toWei('0.34', 'ether'))
    ).toString();
    await priceSource.methods
      .update(
        [mlnAddress.toString()],
        [mlnToWeth]
      )
      .send(defaultTxOpts);

    const updatedPrice = (await priceSource.methods
      .getPrice(mlnAddress.toString())
      .call())[0];

    expect(updatedPrice).toEqual(mlnToWeth);
  });
});
