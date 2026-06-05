import { signTypedData, SignTypedDataVersion, TypedDataUtils } from '@metamask/eth-sig-util';
const privateKey = Buffer.from('59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', 'hex');
const types = {
  EIP712Domain: [{ name: 'chainId', type: 'uint256' }],
  Tx: [{ name: 'val', type: 'uint256' }]
};

const hash1 = TypedDataUtils.eip712Hash({
  types, primaryType: 'Tx', domain: { chainId: 9000 }, message: { val: 2400 }
}, SignTypedDataVersion.V4);

const hash2 = TypedDataUtils.eip712Hash({
  types, primaryType: 'Tx', domain: { chainId: 9000 }, message: { val: '2400' }
}, SignTypedDataVersion.V4);

console.log(hash1.toString('hex') === hash2.toString('hex'));
