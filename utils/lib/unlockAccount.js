import * as fs from 'fs';
import api from './api';

async function unlock(account, passwordFile) {
  const [password] = fs.readFileSync(passwordFile, 'utf8').split('\n');
  const res = await api.personal.unlockAccount(account, password, '0x0');
  console.assert(res);
}

export default unlock;
