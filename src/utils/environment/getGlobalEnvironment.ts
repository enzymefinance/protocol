import Environment from './Environment';
import { globalEnvironment } from './setGlobalEnvironment';

// To ensure the global env is not changed accidentally, we return a copy here
const getGlobalEnvironment = (): Environment => ({ ...globalEnvironment });

export default getGlobalEnvironment;
