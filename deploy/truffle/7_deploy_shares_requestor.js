const SharesRequestor = artifacts.require('SharesRequestor');
const Registry = artifacts.require('Registry');

module.exports = async deployer => {
  await deployer.deploy(
    SharesRequestor,
    (await Registry.deployed()).address
  );
}
