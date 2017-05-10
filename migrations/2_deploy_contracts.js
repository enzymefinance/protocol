const EtherToken = artifacts.require('./EtherToken.sol');
const MelonToken = artifacts.require('./MelonToken.sol');
const BitcoinToken = artifacts.require('./BitcoinToken.sol');
const RepToken = artifacts.require('./RepToken.sol');
const EuroToken = artifacts.require('./EuroToken.sol');
const PriceFeed = artifacts.require('./PriceFeed.sol');
const Exchange = artifacts.require('./Exchange.sol');
const Universe = artifacts.require('./Universe.sol');

module.exports = (deployer, network, accounts) => {
  // Deploy contracts
  if (network == "development") {
    deployer.deploy([
      EtherToken,
      MelonToken,
      BitcoinToken,
      RepToken,
      EuroToken,
      Exchange,
    ]).then(() =>
      deployer.deploy(PriceFeed, accounts[1], EtherToken.address)
    ).then(() =>
      deployer.deploy(Universe,
        [EtherToken.address, MelonToken.address, BitcoinToken.address, RepToken.address, EuroToken.address],
        [PriceFeed.address, PriceFeed.address, PriceFeed.address, PriceFeed.address, PriceFeed.address],
        [Exchange.address, Exchange.address, Exchange.address, Exchange.address, Exchange.address]
      )
    );
  }

  if (network == "kovan") {
    deployer.deploy(Universe,
      ['0x7506c7bfed179254265d443856ef9bda19221cd7', '0x4dffea52b0b4b48c71385ae25de41ce6ad0dd5a7', '0x9e4c56a633dd64a2662bdfa69de4fde33ce01bdd', '0xc151b622fded233111155ec273bfaf2882f13703', '0xf61b8003637e5d5dbb9ca8d799ab54e5082cbdbc'],
      ['0x442Fd95C32162F914364C5fEFf27A0Dc05214706', '0x442Fd95C32162F914364C5fEFf27A0Dc05214706', '0x442Fd95C32162F914364C5fEFf27A0Dc05214706', '0x442Fd95C32162F914364C5fEFf27A0Dc05214706', '0x442Fd95C32162F914364C5fEFf27A0Dc05214706'],
      ['0x6d46E96E8a9E2544611B4cC2c59f3919B11Df9b1', '0x6d46E96E8a9E2544611B4cC2c59f3919B11Df9b1', '0x6d46E96E8a9E2544611B4cC2c59f3919B11Df9b1', '0x6d46E96E8a9E2544611B4cC2c59f3919B11Df9b1', '0x6d46E96E8a9E2544611B4cC2c59f3919B11Df9b1']
    )
  }
};
