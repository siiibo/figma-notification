const path = require("path");
const { node } = require("webpack");
const nodeExternals = require("webpack-node-externals"); // https://github.com/neverendingqs/netlify-express/issues/4
// const GasPlugin = require("gas-webpack-plugin");

const mode =
  process.env.NODE_ENV === "development" ? "development" : "production";
const devtool = "inline-source-map";
const entry = path.resolve("src", "figma-notification.ts");
const outPath = path.resolve("build");
const outFileName = "backend.js";
const output = {
  path: outPath,
  filename: outFileName,
};
const rules = [
  {
    test: /\.[tj]s$/,
    use: {
      loader: "ts-loader",
      options: {
        allowTsInNodeModules: true,
        transpileOnly: true,
        configFile: path.resolve("tsconfig.json"),
      },
    },
  },
];
const resolve = {
  extensions: [".ts", ".js", ".json"],
  fallback: {
    path: false,
    os: false,
  },
};
// const plugins = [new GasPlugin()];

module.exports = [
  {
    mode: mode,
    entry,
    output,
    module: { rules },
    resolve,
    target: "node", // added for nodejs
    externals: [nodeExternals()], // https://github.com/neverendingqs/netlify-express/issues/4
    //plugins,
  },
];
