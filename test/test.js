const fs = require('fs');
const assert = require('assert');

assert(fs.existsSync('./journal/dashboard.html'), 'dashboard.html should exist');

const lambdaSource = fs.readFileSync('./backend/lambda/index.js', 'utf8');
assert(/exports\.handler/.test(lambdaSource), 'lambda handler export should exist');

console.log('All tests passed.');
