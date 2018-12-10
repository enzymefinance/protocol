const getLatestBlock = async environment => {
  return environment.eth.getBlock('latest');
};

export { getLatestBlock };
