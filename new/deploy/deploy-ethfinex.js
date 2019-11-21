const {nab, call, send, fetch} = require('./deploy-contract');

const zeroAddress = '0x0000000000000000000000000000000000000000'; // TODO: import from util

const main = async input => {
  const addrs = {};
  addrs.Exchange = input.zeroex.addr.Exchange;
  const wrapperRegistryEFX = await nab('WrapperRegistryEFX', [], input.ethfinex.addr);
  addrs.WrapperRegistryEFX = wrapperRegistryEFX.options.address;
  const erc20Proxy = await fetch('ERC20Proxy', input.zeroex.addr.ERC20Proxy);

  const wrapperMap = new Map();
  for (const tokenSym of Object.keys(input.tokens.addr)) {
    if (tokenSym === 'WETH') {
      const wrapperLockEth = await nab('WrapperLockEth', [
        'WETH',
        'WETH token',
        18,
        input.zeroex.addr.Exchange,
        input.zeroex.addr.ERC20Proxy,
      ], input.ethfinex.addr);
      addrs.WrapperLockEth = wrapperLockEth.options.address;
      wrapperMap.set(input.tokens.addr['WETH'], wrapperLockEth.options.address);
    } else {
      const wrapSym = `W-${tokenSym}`;
      const wrapper = await nab('WrapperLock', [
        input.tokens.addr[tokenSym],
        wrapSym,
        `Wrapped ${tokenSym} Token`,
        input.tokens.conf[tokenSym].decimals,
        false,
        input.zeroex.addr.Exchange,
        input.zeroex.addr.ERC20Proxy,
      ], input.ethfinex.addr, wrapSym);
      addrs[wrapSym] = wrapper.options.address;
      wrapperMap.set(input.tokens.addr[tokenSym], wrapper.options.address);
    }
  }

  // remove token/wrapper pairs where the token is already registered
  // otherwise addNewWrapperPair will fail
  for (const originalToken of Array.from(wrapperMap.keys())) {
    const wrapperForToken = await call(wrapperRegistryEFX, 'token2WrapperLookup', [originalToken]);
    if (wrapperForToken !== zeroAddress) {
      wrapperMap.delete(originalToken);
    }
  }

  if (wrapperMap.size > 0) {
    await send(wrapperRegistryEFX, 'addNewWrapperPair', [
      Array.from(wrapperMap.keys()), Array.from(wrapperMap.values())
    ]);
  }

  return addrs;
}

module.exports = main;
