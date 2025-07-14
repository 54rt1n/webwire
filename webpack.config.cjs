const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = (env, argv) => {
  const isProd = argv.mode === 'production';

  return {
    mode: isProd ? 'production' : 'development',
    devtool: isProd ? false : 'inline-source-map',
    entry: {
      background: './src/background/webwire-background.js',
      content: './src/content/index.js',
      popup: './src/popup/index.js',
      mcp_status: './src/mcp/index.js',
      conversations: './src/conversations/index.js',
      options: './src/options/index.js'
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env']
            }
          }
        },
        {
          test: /\.(css|scss)$/,
          use: [
            isProd ? MiniCssExtractPlugin.loader : 'style-loader',
            'css-loader',
            'sass-loader'
          ]
        },
        {
          test: /\.(png|svg|jpg|jpeg|gif)$/i,
          type: 'asset/resource',
          generator: {
            filename: 'images/[name][ext]'
          }
        }
      ]
    },
    plugins: [
      new CopyPlugin({
        patterns: [
          { 
            from: './src/manifest.json.dist', 
            to: 'manifest.json',
            transform(content) {
              // Generate manifest based on package.json info
              const packageJson = require('./package.json');
              const manifest = JSON.parse(content.toString());
              
              // Update version from package.json
              manifest.version = packageJson.version;
              
              return JSON.stringify(manifest, null, 2);
            } 
          },
          { from: './src/icons', to: 'icons' }
        ]
      }),
      new HtmlWebpackPlugin({
        template: './src/options/index.html',
        filename: 'options.html',
        chunks: ['options']
      }),
      new HtmlWebpackPlugin({ 
        template: './src/popup/index.html',
        filename: 'popup.html',
        chunks: ['popup']
      }),
      new HtmlWebpackPlugin({
        template: './src/mcp/index.html',
        filename: 'mcp_status.html',
        chunks: ['mcp_status']
      }),
      new HtmlWebpackPlugin({
        template: './src/conversations/index.html',
        filename: 'conversations.html',
        chunks: ['conversations']
      }),
      isProd && new MiniCssExtractPlugin({
        filename: '[name].css'
      })
    ].filter(Boolean)
  };
};