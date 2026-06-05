import { Client } from '@bnb-chain/greenfield-js-sdk';
const pk = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const client = Client.create('http://localhost:26750', '9000');
// The SDK has some internal helpers
// Let's try to find them
import pkg from '@bnb-chain/greenfield-js-sdk';
const { getSignByPriKey } = pkg;
// Wait, it's not exported that way
