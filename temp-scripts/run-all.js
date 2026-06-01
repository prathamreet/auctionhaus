const { execSync } = require('child_process');
const path = require('path');

function runScript(scriptName) {
  const scriptPath = path.resolve(__dirname, scriptName);
  console.log(`\n🚀 Executing: node ${scriptPath}`);
  try {
    execSync(`node "${scriptPath}"`, { stdio: 'inherit' });
  } catch (error) {
    console.error(`❌ Failed to run script ${scriptName}:`, error.message);
    process.exit(1);
  }
}

console.log('🏁 Starting complete database rebuild and seeding...');
runScript('clear.js');
runScript('populate.js');
console.log('\n🎉 ALL DONE! Your database is now fully populated with active and complete records. You can now start your servers and take screenshots of the populated dashboards!');
