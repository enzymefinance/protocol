import * as fs from "fs";
import deployTokens from "./contracts/tokens";
import deployCompliance from "./contracts/compliance";
import deployRiskManagement from "./contracts/riskManagement";
import deployExchanges from "./contracts/exchanges";
import deployGovernance from "./contracts/governance";
import deployPricefeed from "./contracts/pricefeed";
import deployVersion from "./contracts/version";
import deployCompetition from "./contracts/competition";
import deployFundRanking from "./contracts/fundRanking";

async function deployEnvironment(environment) {
  let deployed = {};
  switch (environment) {
    case 'development':
      deployed = await deployTokens(environment, deployed);
      deployed = await deployCompliance(environment, deployed);
      deployed = await deployRiskManagement(environment, deployed);
      deployed = await deployExchanges(environment, deployed);
      deployed = await deployGovernance(environment, deployed);
      deployed = await deployPricefeed(environment, deployed);
      deployed = await deployVersion(environment, deployed);
      deployed = await deployCompetition(environment, deployed);
      deployed = await deployFundRanking(environment, deployed);
      break;
    case 'kovan-demo':
      break;
    case 'kovan-competition':
      break;
    case 'live-competition':
      break;
    default:
      throw new Error(`Environment ${environment} not defined.`);
  }
  return deployed;
}

async function writeToAddressBook(deployedContracts, environment) {
  let addressBook;
  if (fs.existsSync(addressBookFile)) {
    addressBook = JSON.parse(fs.readFileSync(addressBookFile));
  } else addressBook = {};

  const namesToAddresses = {};
  Object.keys(deployedContracts)
    .forEach(key => {
      namesToAddresses[key] = deployedContracts[key].options.address
    });
  addressBook[environment] = namesToAddresses;

  fs.writeFileSync(
    addressBookFile,
    JSON.stringify(addressBook, null, '  '),
    'utf8'
  );
}

if (require.main === module) {
  const environment = process.env.CHAIN_ENV;
  deployEnvironment(environment)
    .then(deployedContracts => writeToAddressBook(deployedContracts, environment))
    .catch(err => console.error(err.stack))
    .finally(() => process.exit())
}

export default deployEnvironment;
