import { Wallet } from 'ethers';
const pk = '0x0000000000000000000000000000000000000000000000000000000000000001';
const w = new Wallet(pk);
console.log('Addr:', w.address);
console.log('Pub:', w._signingKey().compressedPublicKey);
