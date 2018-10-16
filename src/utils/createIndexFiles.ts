import * as glob from 'glob';

const createIndexFiles = () => {
  const sourceFiles = glob.sync('./src/**/*.ts');
  console.log(sourceFiles);
};

if (require.main === module) {
  createIndexFiles();
  // process.exit();
}

export default createIndexFiles;
