const { signTypedData, SignTypedDataVersion } = require('@metamask/eth-sig-util');
try {
  signTypedData({
    privateKey: Buffer.from('59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', 'hex'),
    data: {
      types: {
        EIP712Domain: [{ name: 'chainId', type: 'uint256' }],
        Tx: [{ name: 'chain_id', type: 'uint256' }]
      },
      primaryType: 'Tx',
      domain: { chainId: 9000 },
      message: { chain_id: 'greenfield_9000-1' }
    },
    version: SignTypedDataVersion.V4
  });
  console.log("Success");
} catch (e) {
  console.log("Error: " + e.message);
}
