const path = require('path');
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin")


module.exports = {
  entry: './src/index.ts',
  module: {
    rules: [
      {
        test: /\.ts?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  externals: {
    'turndown': 'commonjs turndown',
    'joplin-turndown-plugin-gfm': 'commonjs joplin-turndown-plugin-gfm',
    '@aws-sdk/client-s3' : '@aws-sdk/client-s3',    
  },
  // plugins: [
  //   new NodePolyfillPlugin()
  // ],
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    fallback: {
    // "fs": false,
    // "path": false,
    // "os": false,
    // "path": false,
    // "zlib": false,
    // "http": false,
    // "https": false,
    // "stream": false,
    // "crypto": false,
    // "url": false,
    // "timers" : false,
    // "buffer" : false,
    // "util" : false,
    // "tty" : false,
    // "net" : false,
    // "assert" : false,    
    } 
  },
  // output: {
  //   filename: 'bundle.js',
  //   path: path.resolve(__dirname, 'dist'),
  // },
  experiments: {
    outputModule: true,
  },
  target : "node20",
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'main.mjs',
    libraryTarget: 'module',
    chunkFormat: 'module'
  },
  devServer: {
    static: path.join(__dirname, "dist"),
    compress: true,
    port: 4000,
  },
};