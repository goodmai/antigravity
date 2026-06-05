import ethSigUtil from '@metamask/eth-sig-util';
import * as bytes from '@ethersproject/bytes';

const pk = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const privateKeyBytes = bytes.arrayify(pk);

const types = {
  EIP712Domain: [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'string' },
    { name: 'salt', type: 'string' },
  ],
  Tx: [
    { name: 'account_number', type: 'uint256' },
    { name: 'chain_id', type: 'string' }, // Try string type for chain_id in message body
    { name: 'sequence', type: 'uint256' },
    { name: 'memo', type: 'string' },
  ],
};

function trySignMixed() {
  console.log(`\n--- Trying signing with mixed chain ID types ---`);
  const domain = {
    name: 'Greenfield Tx',
    version: '1.0.0',
    chainId: 9000,
    verifyingContract: '0x71e835aff094655dEF897fbc85534186DbeaB75d',
    salt: '0',
  };

  const message = {
    account_number: '0',
    chain_id: 'greenfield_9000-1',
    sequence: '0',
    memo: '',
  };

  const eip712 = {
    types,
    primaryType: 'Tx',
    domain,
    message,
  };

  try {
    const signature = ethSigUtil.signTypedData({
      privateKey: privateKeyBytes,
      data: eip712,
      version: ethSigUtil.SignTypedDataVersion.V4,
    });
    console.log('Signature generated successfully:', signature);

    const messageHash = ethSigUtil.TypedDataUtils.eip712Hash(eip712, ethSigUtil.SignTypedDataVersion.V4);
    console.log('Message Hash generated successfully');
  } catch (err) {
    console.error('Signing failed:', err.message);
  }
}

trySignMixed();
