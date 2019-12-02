import { BN, toWei } from 'web3-utils';
import { BNExpDiv } from '~/tests/utils/new/BNmath';
import { CONTRACT_NAMES } from '~/tests/utils/new/constants';
const web3 = require('../../../../deploy/utils/get-web3');
const {deploy} = require('../../../../deploy/utils/deploy-contract');

describe('prices-unit-tests', () => {
  let user, defaultTxOpts;
  let mln, weth, priceSource;

  beforeAll(async () => {
    const accounts = await web3.eth.getAccounts();
    user = accounts[0];
    defaultTxOpts = { from: user, gas: 8000000 };

    weth = await deploy(
      CONTRACT_NAMES.PREMINED_TOKEN,
      ['WETH', 18, '']
    );

    mln = await deploy(
      CONTRACT_NAMES.BURNABLE_TOKEN,
      ['MLN', 18, '']
    );

    priceSource = await deploy(
      CONTRACT_NAMES.TESTING_PRICEFEED,
      [weth.options.address, 18]
    );
  });

  it('price updates', async () => {
    const mlnToWeth = BNExpDiv(
      new BN(toWei('1', 'ether')),
      new BN(toWei('0.34', 'ether'))
    ).toString();
    await priceSource.methods
      .update(
        [mln.options.address],
        [mlnToWeth]
      )
      .send(defaultTxOpts);

    const updatedPrice = (await priceSource.methods
      .getPrice(mln.options.address)
      .call())[0];

    expect(updatedPrice).toEqual(mlnToWeth);
  });
});
