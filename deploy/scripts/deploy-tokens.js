const {nab, send, call} = require('../utils/deploy-contract');
const web3 = require('../utils/get-web3');
const BN = web3.utils.BN;

const main = async input => {
  const tokenAddrs = input.tokens.addr;
  const weth = await nab('WETH', [], tokenAddrs);
  const mln = await nab('BurnableToken', ['MLN', 18, 'Melon Token'], tokenAddrs, 'MLN');
  const bat = await nab('PreminedToken', ['BAT', 18, ''], tokenAddrs, 'BAT');
  const dai = await nab('PreminedToken', ['DAI', 18, ''], tokenAddrs, 'DAI');
  const eur = await nab('PreminedToken', ['EUR', 18, ''], tokenAddrs, 'EUR');
  const knc = await nab('PreminedToken', ['KNC', 18, ''], tokenAddrs, 'KNC');
  const mkr = await nab('PreminedToken', ['MKR', 18, ''], tokenAddrs, 'MKR');
  const rep = await nab('PreminedToken', ['REP', 18, ''], tokenAddrs, 'REP');
  const zrx = await nab('PreminedToken', ['ZRX', 18, ''], tokenAddrs, 'ZRX');
  const omg = await nab('BadERC20Token', ['OMG', 18, ''], tokenAddrs, 'OMG');

  const initialWeth = input.tokens.conf.WETH.initialDepositAmount;
  const wethAlreadyOwned = await call(weth, 'balanceOf', [web3.eth.accounts.wallet[0].address]);
  const wethToDeposit = new BN(initialWeth).sub(new BN(wethAlreadyOwned));
  if (wethToDeposit.gt(new BN(0))) {
    await send(weth, 'deposit', [], {value: wethToDeposit});
  }

  return {
    "WETH": weth,
    "MLN": mln,
    "BAT": bat,
    "DAI": dai,
    "EUR": eur,
    "KNC": knc,
    "MKR": mkr,
    "REP": rep,
    "ZRX": zrx,
    "OMG": omg,
  };
}

module.exports = main;
