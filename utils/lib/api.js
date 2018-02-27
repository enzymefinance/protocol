import Api from "@parity/api";
import * as masterConfig from "../config/environment";

const config = masterConfig[process.env.CHAIN_ENV];
const provider = new Api.Provider.Http(`http://${config.host}:${config.port}`);
const api = new Api(provider);

export default api;
