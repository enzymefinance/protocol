import web3EthAbi from 'web3-eth-abi';
import { readFileSync } from 'fs';

export const getABI = contractName =>
  JSON.parse(readFileSync(`out/${contractName}.json`, "utf8")).abi;

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

export const getEventCountFromLogs = (logs, contractName, eventName) => {
  const abi = getABI(contractName);
  const eventAbi = abi.find(e => e.type === 'event' && e.name === eventName);

  let counter = 0;
  for (const log of Object.values(logs)) {
    if (log.topics[0] === web3EthAbi.encodeEventSignature(eventAbi)) {
      counter++;
    }
  }

  return counter;
}

export const getEventFromLogs = (logs, contractName, eventName) => {
  const abi = getABI(contractName);
  const eventAbi = abi.find(e => e.type === 'event' && e.name === eventName);

  for (const log of Object.values(logs)) {
    if (log.topics[0] === web3EthAbi.encodeEventSignature(eventAbi)) {
      return web3EthAbi.decodeLog(
        eventAbi.inputs,
        log.data,
        log.topics.slice(1)
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
