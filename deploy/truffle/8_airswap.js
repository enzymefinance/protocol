const AirSwapTypes = artifacts.require('AirSwapTypes');
const AirSwapTransferHandlerRegistry = artifacts.require('AirSwapTransferHandlerRegistry');
const AirSwapSwap = artifacts.require('AirSwapSwap');
const AirSwapERC20TransferHandler = artifacts.require('AirSwapERC20TransferHandler');

module.exports = async deployer => {
  const typesLib = await deployer.deploy(AirSwapTypes);
  const transferHandlerRegistry = await deployer.deploy(AirSwapTransferHandlerRegistry);
  const erc20TransferHandler = await deployer.deploy(AirSwapERC20TransferHandler);
  await deployer.link(AirSwapTypes, AirSwapSwap);
  const swap = await deployer.deploy(AirSwapSwap, transferHandlerRegistry.address);
}
