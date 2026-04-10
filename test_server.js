const fs = require('fs');
const logFile = __dirname + '/test_log.txt';

function log(msg) {
  fs.appendFileSync(logFile, msg + '\n');
}

fs.writeFileSync(logFile, 'Test started at ' + new Date().toISOString() + '\n');

try {
  log('Loading server.js...');
  require('./server.js');
  log('Server loaded successfully');
} catch (e) {
  log('ERROR: ' + e.message);
  log('STACK: ' + e.stack);
}

setTimeout(() => {
  log('Timeout reached - exiting');
  process.exit(0);
}, 8000);
