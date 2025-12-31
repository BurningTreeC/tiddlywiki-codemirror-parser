import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import dts from "rollup-plugin-dts";

const external = ["@lezer/common", "@lezer/highlight"];

const jsPlugins = [
  resolve({
    extensions: [".mjs", ".js", ".json", ".ts"]
  }),
  commonjs(),
  typescript({
    tsconfig: "./tsconfig.json",
    declaration: false,
    declarationMap: false
  })
];

export default [
  // JS builds (ESM + CJS) from the same input
  {
    input: "src/index.ts",
    external,
    plugins: jsPlugins,
    output: [
      {
        file: "dist/parser.js",
        format: "es",
        sourcemap: true
      },
      {
        file: "dist/parser.cjs",
        format: "cjs",
        sourcemap: true,
        exports: "named"
      }
    ]
  },

  // Type definitions
  {
    input: "src/index.ts",
    external,
    plugins: [dts()],
    output: {
      file: "dist/parser.d.ts",
      format: "es"
    }
  }
];
