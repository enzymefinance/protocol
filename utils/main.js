#!/usr/bin/env babel-node

// import Api from "@parity/api";
import program from 'commander';
import pkgInfo from "../package.json";
// import environmentConfig from "./config/environment";
// import updateDatafeed, * as deployedUtils from "./lib/utils";

program
  .version(pkgInfo.version)
  .option('-n, --network <environment>', 'Network environment', /^(development|melon|kovan|live)$/i, 'development')
  .option('-p --pricefeed [pricefeed]', 'Deploy pricefeed with registered assets', /^(yes|no)$/i, 'yes')
  .parse(process.argv);

console.log(` Selected network: ${program.network}`);
console.log(` Deploy pricefeed: ${program.pricefeed}`);

// const addressBookFile = "../addressBook.json";
// const config = environmentConfig[program.network];
// const provider = new Api.Provider.Http(
//   `http://${config.host}:${config.port}`,
// );
// const api = new Api(provider);
