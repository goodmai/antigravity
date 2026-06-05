import { privateKeyToAccount } from 'viem/accounts';
import { hashTypedData, recoverPublicKey } from 'viem';

const pk = '0x0000000000000000000000000000000000000000000000000000000000000001';
const account = privateKeyToAccount(pk);

const domain = {
  name: 'Greenfield',
  version: '1',
  chainId: 9000,
};

const types = {
  Greeting: [{ name: 'from', type: 'string' }],
};

const message = { from: 'Alice' };

const signature = await account.signTypedData({ domain, types, primaryType: 'Greeting', message });
const pubkey = await recoverPublicKey({
  hash: hashTypedData({ domain, types, primaryType: 'Greeting', message }),
  signature,
});

console.log('Recovered Pubkey:', pubkey);
