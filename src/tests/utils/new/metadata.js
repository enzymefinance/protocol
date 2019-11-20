export const getABI = contractName =>
  require(`~/../out/${contractName}.abi.json`);

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
