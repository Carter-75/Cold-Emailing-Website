const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Starting project build stabilization...');

// 1. Environmental Burn-In for ApiService
const apiServicePath = path.join(__dirname, 'src/app/services/api.service.ts');
if (fs.existsSync(apiServicePath)) {
  console.log('📝 Injecting environment variables into ApiService...');
  let content = fs.readFileSync(apiServicePath, 'utf8');
  content = content
    .replace('__PRODUCTION__', process.env.PRODUCTION || 'false')
    .replace('__PROD_BACKEND_URL__', process.env.PROD_BACKEND_URL || '')
    .replace('__PROD_FRONTEND_URL__', process.env.PROD_FRONTEND_URL || '');
  fs.writeFileSync(apiServicePath, content);
}

// 2. Run Angular Build
console.log('🛠 Running Angular build...');
try {
  execSync('npx ng build', { stdio: 'inherit' });
} catch (err) {
  console.error('❌ Angular build failed!');
  process.exit(1);
}

// 3. Flatten dist directory (Vercel artifact preparation)
const distRoot = path.join(__dirname, 'dist/frontend');
const browserDist = path.join(distRoot, 'browser');

if (fs.existsSync(browserDist)) {
  console.log('📂 Flattening dist directory structure...');
  const files = fs.readdirSync(browserDist);
  for (const file of files) {
    fs.renameSync(path.join(browserDist, file), path.join(distRoot, file));
  }
  fs.rmdirSync(browserDist);
}

console.log('✅ Build stabilization complete!');
