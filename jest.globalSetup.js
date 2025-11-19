// Jest global setup - runs once before all tests
const { execSync } = require('child_process');
const path = require('path');

module.exports = async () => {
  console.log('\n🔧 Setting up test database...\n');

  try {
    // Load test environment variables
    require('dotenv').config({ path: '.env.test' });

    // Push Prisma schema to test database
    execSync('pnpm prisma db push --skip-generate --accept-data-loss', {
      cwd: path.resolve(__dirname),
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL || 'file::memory:?cache=shared',
      },
    });

    console.log('\n✅ Test database setup complete\n');
  } catch (error) {
    console.error('\n❌ Failed to setup test database:', error.message);
    throw error;
  }
};
