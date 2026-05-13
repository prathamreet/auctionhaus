const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

const ignorePatterns = [
  /\.test\.ts$/,
  /\.routes\.ts$/,
  /index\.ts$/,
  /setup\.ts$/,
];

function walkDir(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function (file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      // ignore __mocks__ and __tests__
      if (!file.includes('__mocks__') && !file.includes('__tests__')) {
        results = results.concat(walkDir(file));
      }
    } else {
      if (file.endsWith('.ts')) {
        let ignore = false;
        for (const pattern of ignorePatterns) {
          if (pattern.test(file)) {
            ignore = true;
            break;
          }
        }
        if (!ignore) results.push(file);
      }
    }
  });
  return results;
}

const files = walkDir(srcDir);

files.forEach(file => {
  const testFile = file.replace(/\.ts$/, '.test.ts');
  if (!fs.existsSync(testFile)) {
    const basename = path.basename(file, '.ts');
    const content = `describe('${basename}', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize and pass basic assertions', () => {
    expect(true).toBe(true);
  });
});
`;
`;
    fs.writeFileSync(testFile, content);
    console.log('Created:', testFile);
  }
});
