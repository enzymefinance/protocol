var path = require('path');

module.exports = {
  target: 'node',
  entry: './src/index.ts',
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'index.js',
    library: 'melon-protocol',
    libraryTarget: 'umd',
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: [ '.tsx', '.ts', '.js', 'json' ],
    alias: {
      '~': path.resolve(__dirname, 'src'),
    }
  },
  // externals: {
  //   lodash: {
  //     commonjs: 'lodash',
  //     commonjs2: 'lodash',
  //     amd: 'lodash',
  //     root: '_'
  //   }
  // }
};
