import Environment from './Environment';
import { globalEnvironment } from './setGlobalEnvironment';

const getGlobalEnvironment = (): Environment => ({ ...globalEnvironment });

export default getGlobalEnvironment;
