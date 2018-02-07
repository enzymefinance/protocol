import test from "ava";
import api from "../../utils/lib/api";
import {deployContract} from "../../utils/lib/contracts";
import deployEnvironment from "../../utils/deploy/contracts";
import getSignatureParameters from "../../utils/lib/getSignatureParameters";

const environmentConfig = require("../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];

let accounts
let fundRanking;
let deployed;
let version;
let manager;
let deployer;

const fundNames = ["Fund Name 1", "Fund Name 2"];

// To convert bytes to string
function binToString(array){
	let result = "";
  const bytes = array._value;
	for(let i = 0; i < bytes.length; i += 1){
    const convertedChar = (String.fromCharCode(bytes[i]));
    if (convertedChar === "\u0000") {
      break;
    }
		result+= convertedChar;
	}
	return result;
}

// To return values from the array
function processArray(array) {
  const newArray = [];
  for (let i = 0; i < array.length; i += 1) {
    const newInnerArray = [];
    const innerArray = array[i];
    for (let j = 0; j < innerArray.length; j += 1) {
        newInnerArray[j] = innerArray[j]._value;
				if (i === 3) {
					newInnerArray[j] = binToString(innerArray[j]);
				}
    }
    newArray[i] = newInnerArray;
  }
  return newArray;
}

 test.before(async () => {
   deployed = await deployEnvironment(environment);
   accounts = await api.eth.accounts();
   [deployer, manager] = accounts;
   version = deployed.Version;

 });

 test.beforeEach(async () => {
   fundRanking = await deployContract(
     "FundRanking",
     {from: deployer},
     [version.address]
   );
   version = await deployed.Version;

   // Fund Setup 1
   let [r, s, v] = await getSignatureParameters(manager);
   await version.instance.setupFund.postTransaction(
     { from: manager, gas: config.gas, gasPrice: config.gasPrice },
     [
       fundNames[0], // name of the fund
       deployed.MlnToken.address, // reference asset
       config.protocol.fund.managementFee,
       config.protocol.fund.performanceFee,
       deployed.NoCompliance.address,
       deployed.RMMakeOrders.address,
       deployed.PriceFeed.address,
       [deployed.SimpleMarket.address],
       [deployed.SimpleAdapter.address],
       v,
       r,
       s,
     ],
   );

   // Fund Setup 2
   [r, s, v] = await getSignatureParameters(deployer);
   await version.instance.setupFund.postTransaction(
     { from: deployer, gas: config.gas, gasPrice: config.gasPrice },
     [
       fundNames[1], // name of the fund
       deployed.MlnToken.address, // reference asset
       config.protocol.fund.managementFee,
       config.protocol.fund.performanceFee,
       deployed.NoCompliance.address,
       deployed.RMMakeOrders.address,
       deployed.PriceFeed.address,
       [deployed.SimpleMarket.address],
       [deployed.SimpleAdapter.address],
       v,
       r,
       s,
     ],
   );
 });

 // test to check getFundDetails() method
 test('get address, shareprice, time and name of all funds in a version', async (t) => {
   accounts = await api.eth.accounts();
   const fundDetails = await fundRanking.instance.getFundDetails.call();
   const finalArray = processArray(fundDetails);
	 console.log(finalArray);
   const addrs = [];
   addrs[0] = await version.instance.getFundById.call({}, [0]);
   addrs[1] = await version.instance.getFundById.call({}, [1]);
   fundNames.forEach((name, i) => {
     t.is(finalArray[0][i], addrs[i]);
     t.truthy(finalArray[1][i]);
     t.truthy(finalArray[2][i]);
     t.is(finalArray[3][i], name);
   });

 });
