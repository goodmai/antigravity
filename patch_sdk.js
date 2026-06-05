const fs = require('fs');

function patchFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  let code = fs.readFileSync(filePath, 'utf8');
  
  // Patch 1: Replace { name: 'chain_id', type: 'string' } with uint256 in Tx struct
  code = code.replace(
    /name:\s*'chain_id',\s*type:\s*'string'/g,
    "name: 'chain_id',\n                type: 'uint256'"
  );

  // Patch 2: The chain_id assignment
  // normMsg.chain_id = chainId; -> normMsg.chain_id = isNaN(Number(chainId)) ? chainId : Number(chainId);
  code = code.replace(
    /normMsg\.chain_id = chainId;/g,
    "normMsg.chain_id = isNaN(Number(chainId)) ? chainId : Number(chainId);"
  );

  // Patch 3: Lowercase addresses in lowercaseAddresses
  // Just in case it's not lowercase-ing fee.payer
  // We can just rely on the existing lowercaseAddresses

  // Patch 4: type '/greenfield.storage.MsgCreateBucket'
  // Let's not monkey-patch msg1 type here, we'll see if the SDK does it.
  
  fs.writeFileSync(filePath, code);
  console.log('Patched ' + filePath);
}

patchFile('smartcontracts/greenfield-testnet/node_modules/@bnb-chain/greenfield-js-sdk/dist/cjs/index.js');
patchFile('smartcontracts/e2e/node_modules/@bnb-chain/greenfield-js-sdk/dist/cjs/index.js');
