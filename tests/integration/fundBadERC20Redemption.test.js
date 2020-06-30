import mainnetAddrs from '~/mainnet_thirdparty_contracts';
import { BN, toWei } from 'web3-utils';
import { deploy, call, send } from '~/deploy/utils/deploy-contract';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import { updateKyberPriceFeed, setKyberRate } from '../utils/updateKyberPriceFeed';
import { getDeployed } from '~/tests/utils/getDeployed';

let web3;
let defaultTxOpts, managerTxOpts, investorTxOpts;
let deployer, manager, investor;
let fund, weth, omg, registry, fundFactory, priceSource, kyberAdapter;

// @dev Set fund denomination asset to OMG so it can receive OMG as investment
beforeAll(async () => {
  web3 = await startChain();
  [deployer, manager, investor] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };

  registry = getDeployed(CONTRACT_NAMES.REGISTRY, web3);
  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);
  kyberAdapter = getDeployed(CONTRACT_NAMES.KYBER_ADAPTER, web3);
  priceSource = getDeployed(CONTRACT_NAMES.KYBER_PRICEFEED, web3);
  weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);

  omg = await deploy(
    CONTRACT_NAMES.BAD_TOKEN,
    ['OMG', 18, 'Bad'],
    {},
    [],
    web3
  );

  await send(
    registry,
    'registerPrimitive',
    [omg.options.address],
    defaultTxOpts,
    web3
  );

  await setKyberRate(omg.options.address, web3);
  await updateKyberPriceFeed(priceSource, web3);

  fund = await setupFundWithParams({
    integrationAdapters: [kyberAdapter.options.address],
    initialInvestment: {
      contribAmount: toWei('1', 'ether'),
      investor,
      tokenContract: omg,
    },
    manager,
    quoteToken: omg.options.address,
    fundFactory,
    web3
  });
});

describe('Investor redeems BadERC20 token from a fund', () => {
  test('investor redeems shares', async () => {
    const { shares, vault } = fund;

    const fundBadERC20Balance = new BN(await call(omg, 'balanceOf', [vault.options.address]));
    expect(fundBadERC20Balance).bigNumberEq(new BN(toWei('1', 'ether')));

    const preInvestorShares = new BN(await call(shares, 'balanceOf', [investor]));
    expect(preInvestorShares).bigNumberGt(new BN(0));
    const preInvestorBadERC20Balance = new BN(await call(omg, 'balanceOf', [investor]));

    await send(shares, 'redeemShares', [], investorTxOpts, web3);

    const postInvestorShares = new BN(await call(shares, 'balanceOf', [investor]));
    expect(postInvestorShares).bigNumberEq(new BN(0));
    const postInvestorBadERC20Balance = new BN(await call(omg, 'balanceOf', [investor]));
    expect(postInvestorBadERC20Balance.sub(preInvestorBadERC20Balance)).bigNumberEq(new BN(toWei('1', 'ether')));
  });
});
