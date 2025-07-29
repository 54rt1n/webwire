const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const createConfig = (env, argv, variant) => {
  const isProd = argv.mode === 'production';
  const isLite = variant === 'lite';
  const outputDir = isLite ? 'dist-lite' : 'dist-full';
  const appDir = isLite ? 'app-lite' : 'app';

  return {
    name: variant,
    mode: isProd ? 'production' : 'development',
    devtool: isProd ? false : 'inline-source-map',
    entry: {
      background: `./${appDir}/background.js`,
      content: `./${appDir}/content.js`,
      popup: `./${appDir}/popup/index.js`,
      options: `./${appDir}/options/index.js`,
      guide: `./${appDir}/guide/index.js`,
      conversations: './src/conversations/index.js',
      prompts: './src/prompts/index.js',
      // Only include MCP entries for full version
      ...(isLite ? {} : {
        mcp_status: './src/mcp/index.js'
      })
    },
    output: {
      path: path.resolve(__dirname, outputDir),
      filename: '[name].js',
      clean: true,
      publicPath: ''
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
            from: `./${appDir}/manifest.json.dist`, 
            to: 'manifest.json',
            transform(content) {
              // Generate manifest based on package.json info
              const packageJson = require('./package.json');
              const manifest = JSON.parse(content.toString());
              
              // Update version from package.json, strip any -beta suffix for Chrome compatibility
              manifest.version = packageJson.version.replace(/-.*$/, '');
              
              return JSON.stringify(manifest, null, 2);
            }
          },
          { from: `./${appDir}/icons`, to: 'icons' },
          { from: './assets/tokenizers', to: 'tokenizers' },
          { from: './assets/prompts', to: 'prompts' }
        ]
      }),
      new HtmlWebpackPlugin({
        template: `./${appDir}/options/index.html`,
        filename: 'options.html',
        chunks: ['options']
      }),
      new HtmlWebpackPlugin({ 
        template: `./${appDir}/popup/index.html`,
        filename: 'popup.html',
        chunks: ['popup']
      }),
      new HtmlWebpackPlugin({
        template: './src/conversations/index.html',
        filename: 'conversations.html',
        chunks: ['conversations']
      }),
      new HtmlWebpackPlugin({
        template: `./${appDir}/guide/index.html`,
        filename: 'guide.html',
        chunks: ['guide']
      }),
      new HtmlWebpackPlugin({
        template: './src/prompts/index.html',
        filename: 'prompts.html',
        chunks: ['prompts']
      }),
      // Only include MCP HTML for full version
      ...(isLite ? [] : [
        new HtmlWebpackPlugin({
          template: './src/mcp/index.html',
          filename: 'mcp_status.html',
          chunks: ['mcp_status']
        })
      ]),
      isProd && new MiniCssExtractPlugin({
        filename: '[name].css'
      })
    ].filter(Boolean)
  };
};

module.exports = (env, argv) => {
  return [
    createConfig(env, argv, 'full'),
    createConfig(env, argv, 'lite')
  ];
};