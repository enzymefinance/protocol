const { nab, send } = require('../utils/deploy-contract');

const main = async input => {
  const typesLib = await nab('Types', [], input.airSwap.addr);
  const transferHandlerRegistry = await nab('TransferHandlerRegistry', [], input.airSwap.addr);
  const swap = await nab(
    'Swap',
    [transferHandlerRegistry.options.address],
    input.airSwap.addr,
    null,
    [{'name': 'Types', 'addr': typesLib.options.address}],
  );

  const erc20TransferHandler = await nab('ERC20TransferHandler', [], input.airSwap.addr);

  return {
    "Types": typesLib,
    "TransferHandlerRegistry": transferHandlerRegistry,
    "Swap": swap,
    "ERC20TransferHandler": erc20TransferHandler,
  };
}

module.exports = main;

