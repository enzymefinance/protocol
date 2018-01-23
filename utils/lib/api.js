import Api from "@parity/api";
import * as masterConfig from "../config/environment";

// default to development if not specified
let environment;
if(process.env.NODE_ENV === undefined) {
  environment = process.env.NODE_ENV.toLowerCase()
} else {
  console.warn("No environment detected. Defaulting to development environment.");
  environment = "development";
}

const config = masterConfig[environment];
const provider = new Api.Provider.Http(`http://${config.host}:${config.port}`);
const api = new Api(provider);

export default api;
