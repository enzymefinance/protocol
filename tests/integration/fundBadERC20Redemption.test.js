import mainnetAddrs from '~/config';
import { BN, toWei } from 'web3-utils';
import { deploy, call, send } from '~/utils/deploy-contract';
import { CONTRACT_NAMES } from '~/utils/constants';
import { setupFundWithParams } from '~/utils/fund';
import { updateKyberPriceFeed, setKyberRate } from '../utils/updateKyberPriceFeed';
import { getDeployed } from '~/utils/getDeployed';

let defaultTxOpts, managerTxOpts, investorTxOpts;
let deployer, manager, investor;
let fund, weth, omg, registry, fundFactory, priceSource, kyberAdapter;

// @dev Set fund denomination asset to OMG so it can receive OMG as investment
beforeAll(async () => {
  [deployer, manager, investor] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };

  registry = getDeployed(CONTRACT_NAMES.REGISTRY);
  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY);
  kyberAdapter = getDeployed(CONTRACT_NAMES.KYBER_ADAPTER);
  priceSource = getDeployed(CONTRACT_NAMES.KYBER_PRICEFEED);
  weth = getDeployed(CONTRACT_NAMES.WETH, mainnetAddrs.tokens.WETH);

  omg = await deploy(
    CONTRACT_NAMES.BAD_TOKEN,
    ['OMG', 18, 'Bad'],
    {},
    []
  );

  await send(
    registry,
    'registerPrimitive',
    [omg.options.address],
    defaultTxOpts
  );

  await setKyberRate(omg.options.address);
  await updateKyberPriceFeed(priceSource);

  fund = await setupFundWithParams({
    integrationAdapters: [kyberAdapter.options.address],
    initialInvestment: {
      contribAmount: toWei('1', 'ether'),
      investor,
      tokenContract: omg,
    },
    manager,
    quoteToken: omg.options.address,
    fundFactory
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

    await send(shares, 'redeemShares', [], investorTxOpts);

    const postInvestorShares = new BN(await call(shares, 'balanceOf', [investor]));
    expect(postInvestorShares).bigNumberEq(new BN(0));
    const postInvestorBadERC20Balance = new BN(await call(omg, 'balanceOf', [investor]));
    expect(postInvestorBadERC20Balance.sub(preInvestorBadERC20Balance)).bigNumberEq(new BN(toWei('1', 'ether')));
  });
});
