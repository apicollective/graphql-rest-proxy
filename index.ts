import fs from 'fs';

const [node, index, configFn] = process.argv;

if (!configFn) {
  console.error(`Usage: ${node} ${index} <config.json>`);
  process.exit();
}

const config = fs.readFileSync(configFn);