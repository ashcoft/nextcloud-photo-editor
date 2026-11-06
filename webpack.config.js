const path = require('path');
const { VueLoaderPlugin } = require('vue-loader');

module.exports = {
  entry: {
    'photo-editor': './src/main.ts',
    adminSettings: './src/adminSettings.ts',
  },
  output: {
    path: path.resolve(__dirname, 'js'),
    filename: '[name].js',
    library: 'PhotoEditor',
    libraryTarget: 'window',
    // `auto` derives the chunk base from the loaded entry script URL, so the
    // lazily imported editor chunks resolve under /apps/photo_editor/js/
    // rather than relative to the current route.
    publicPath: 'auto',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.vue$/,
        loader: 'vue-loader',
      },
      {
        test: /\.[jt]sx?$/,
        loader: 'babel-loader',
        resolve: {
          fullySpecified: false,
        },
        exclude: /node_modules/,
      },
      {
        test: /\.m?js$/,
        resolve: {
          fullySpecified: false,
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.(png|jpg|gif|svg)$/,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [new VueLoaderPlugin()],
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.vue', '.json'],
    alias: {
      vue$: 'vue/dist/vue.esm-bundler.js',
      '@': path.resolve(__dirname, 'src'),
    },
  },
  performance: {
    hints: false,
  },
};
