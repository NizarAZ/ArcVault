import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const contractsRoot = path.resolve(scriptsRoot, '..', 'arcvault-contracts');
const entryPath = path.join(contractsRoot, 'src', 'RealisticMockLendingStrategy.sol');

function findImports(importPath) {
  const candidates = [
    path.join(contractsRoot, importPath),
    path.join(contractsRoot, 'src', importPath.replace(/^\.\//, '')),
    path.join(
      contractsRoot,
      'lib',
      'openzeppelin-contracts',
      'contracts',
      importPath.replace(/^@openzeppelin\/contracts\//, '')
    ),
    path.join(scriptsRoot, 'node_modules', importPath)
  ];

  const resolved = candidates.find((candidate) => fs.existsSync(candidate));
  if (!resolved) {
    return { error: `Import not found: ${importPath}` };
  }

  return { contents: fs.readFileSync(resolved, 'utf8') };
}

function compile(entryFile, outputContracts) {
  const sourcePath = path.join(contractsRoot, 'src', entryFile);
  const input = {
    language: 'Solidity',
    sources: {
      [`src/${entryFile}`]: {
        content: fs.readFileSync(sourcePath, 'utf8')
      }
    },
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object']
        }
      }
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  const errors = output.errors?.filter((entry) => entry.severity === 'error') || [];

  if (errors.length) {
    throw new Error(errors.map((entry) => entry.formattedMessage).join('\n'));
  }

  return Object.fromEntries(
    outputContracts.map(({ source, contract }) => {
      const artifact = output.contracts[source][contract];
      return [
        contract,
        {
          abi: artifact.abi,
          bytecode: `0x${artifact.evm.bytecode.object}`
        }
      ];
    })
  );
}

export function compileRealisticStrategy() {
  return compile('RealisticMockLendingStrategy.sol', [
    {
      source: 'src/RealisticMockLendingStrategy.sol',
      contract: 'RealisticMockLendingStrategy'
    }
  ]).RealisticMockLendingStrategy;
}

export function compileArcVaultStack() {
  return compile('ArcVault.sol', [
    { source: 'src/ArcVault.sol', contract: 'ArcVault' },
    { source: 'src/yUSDC.sol', contract: 'yUSDC' }
  ]);
}
