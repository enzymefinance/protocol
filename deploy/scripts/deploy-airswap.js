const { nab } = require('../utils/deploy-contract');

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

  return {
    "Types": typesLib,
    "TransferHandlerRegistry": transferHandlerRegistry,
    "Swap": swap,
  };
}

module.exports = main;
