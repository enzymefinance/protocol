import web3EthAbi from 'web3-eth-abi';

export const getABI = contractName =>
  require(`~/../out/${contractName}.abi.json`);

export const getEventFromReceipt = (receiptEvents, contractName, eventName) => {
  const abi = getABI(contractName);
  const eventAbi = abi.find(e => e.type === 'event' && e.name === eventName);

  for (const receiptEvent of Object.values(receiptEvents)) {
    const rawData = receiptEvent.raw;
    if (rawData.topics[0] === web3EthAbi.encodeEventSignature(eventAbi)) {
      return web3EthAbi.decodeLog(
        eventAbi.inputs,
        rawData.data,
        rawData.topics.slice(1)
      );
    }
  }

  return null;
}

// this will fail in the case where there is an overload on the abi
export const getFunctionSignature = (contractName, functionName) => {
  const abi = getABI(contractName);

  const functionDefinition = abi.find(
    e => e.type === 'function' &&
    e.name === functionName
  );

  return `${functionDefinition.name}(${functionDefinition.inputs
    .map(d => d.type)
    .join(',')})`;
};
