const { call, fetchContract, nab, send } = require('../utils/deploy-contract');
const { assetDataUtils } = require('@0x/order-utils');
const web3 = require('../utils/get-web3');
const getAccounts = require('../utils/getAccounts.js');

const zeroAddress = '0x0000000000000000000000000000000000000000';

const main = async input => {
  const accounts = await getAccounts();
  const deployer = accounts[0]
  const chainId = await web3.eth.net.getId();

  const exchange = await nab('ZeroExV3Exchange', [chainId], input.zeroExV3.addr);
  const erc20Proxy = await nab('ZeroExV3ERC20Proxy', [], input.zeroExV3.addr);

  const zrxVault = await nab(
    'ZeroExV3ZrxVault',
    [erc20Proxy.options.address, input.tokens.addr.ZRX],
    input.zeroExV3.addr
  );
  const staking = await nab(
    'ZeroExV3Staking',
    [input.tokens.addr.WETH, zrxVault.options.address],
    input.zeroExV3.addr
  );
  const stakingProxy = await nab(
    'ZeroExV3StakingProxy',
    [staking.options.address],
    input.zeroExV3.addr
  );

  // Add ERC20Proxy to Exchange
  const alreadyAuth = await call(erc20Proxy, 'authorized', [exchange.options.address]);
  if (!alreadyAuth) {
    await send(erc20Proxy, 'addAuthorizedAddress', [exchange.options.address]);
    await send(erc20Proxy, 'addAuthorizedAddress', [zrxVault.options.address]);
  }
  const proxyId = await call(erc20Proxy, 'getProxyId');
  let currentProxy;
  if (proxyId !== null) {
    currentProxy = await call(exchange, 'getAssetProxy', [proxyId]);
  }
  if (currentProxy === zeroAddress || proxyId === null) {
    await send(exchange, 'registerAssetProxy', [erc20Proxy.options.address]);
  }
  // Add Exchange to Staking Proxy contract
  const exchangeValid = await call(stakingProxy, 'validExchanges', [exchange.options.address]);
  if (!exchangeValid) {
    await send(stakingProxy, 'addAuthorizedAddress', [deployer]);
    // Approve exchange via stakingDel, the Staking ABI and the deployed StakingProxy address
    const stakingDel = fetchContract('ZeroExV3Staking', stakingProxy.options.address);
    await send(stakingDel, 'addExchangeAddress', [exchange.options.address]);
  }
  // Add ProtocolFee collector and multiplier in Exchange
  const protocolFeeCollectorAddress = await call(exchange, 'protocolFeeCollector');
  if (protocolFeeCollectorAddress === zeroAddress) {
    await send(
      exchange,
      'setProtocolFeeCollectorAddress',
      [stakingProxy.options.address]
    );
    await send(exchange, 'setProtocolFeeMultiplier', [input.zeroExV3.conf.protocolFeeMultiplier]);
  }

  // Add StakingProxy config to ZrxVault
  const vaultStakingProxyAddress = await call(zrxVault, 'stakingProxyAddress');
  if (vaultStakingProxyAddress === zeroAddress) {
    await send(zrxVault, 'addAuthorizedAddress', [deployer]);
    await send(zrxVault, 'setStakingProxy', [stakingProxy.options.address]);
    // NOTE: leaving the below here as they are in 0x's migrations, but they aren't currently necessary
    // await send(staking, 'addAuthorizedAddress', [deployer]);
    // await send(staking, 'addExchangeAddress', [exchange.options.address]);
  }

  return {
    ZeroExV3Exchange: exchange,
    ZeroExV3ERC20Proxy: erc20Proxy,
    ZeroExV3Staking: staking,
    ZeroExV3StakingProxy: stakingProxy,
    ZeroExV3ZrxVault: zrxVault
  };
}

module.exports = main;
