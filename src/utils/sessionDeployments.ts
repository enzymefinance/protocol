const sessionDeployments = {};

export const setSessionDeployment = (id, addresses) => {
  sessionDeployments[id] = addresses;
};

export const getSessionDeployment = id => {
  return sessionDeployments[id];
};
