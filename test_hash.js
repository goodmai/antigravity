import { ethers } from 'ethers';
const types = {
  EIP712Domain: [
    { name: 'chainId', type: 'uint256' },
    { name: 'name', type: 'string' },
    { name: 'salt', type: 'string' },
    { name: 'verifyingContract', type: 'string' },
    { name: 'version', type: 'string' }
  ],
  Tx: [
    { name: 'chain_id', type: 'uint256' }
  ]
};
const domain = {
  name: "Greenfield Tx",
  version: "1.0.0",
  chainId: 9000,
  verifyingContract: "0x71e835aff094655dEF897fbc85534186DbeaB75d",
  salt: "0"
};
const message = { chain_id: 9000 };

const domainTypes = { EIP712Domain: types.EIP712Domain };
const msgTypes = { ...types }; delete msgTypes.EIP712Domain;

const dEnc = ethers.utils._TypedDataEncoder.from(domainTypes);
const mEnc = ethers.utils._TypedDataEncoder.from(msgTypes);

const domainHash = dEnc.hashStruct('EIP712Domain', domain);
const messageHash = mEnc.hashStruct('Tx', message);
const digest = ethers.utils.keccak256(ethers.utils.solidityPack(
  ['string', 'bytes32', 'bytes32'],
  ['\x19\x01', domainHash, messageHash]
));
console.log(digest);
