import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import dts from "rollup-plugin-dts";

const external = [
  "@lezer/common",
  "@lezer/highlight",
  "@codemirror/state",
  "@codemirror/view",
  "@codemirror/language",
  "@codemirror/commands",
  "@codemirror/autocomplete",
  "@codemirror/lang-html"
];

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
    input: "src/codemirror-index.ts",
    external,
    plugins: jsPlugins,
    output: [
      {
        file: "dist/index.js",
        format: "es",
        sourcemap: true
      },
      {
        file: "dist/index.cjs",
        format: "cjs",
        sourcemap: true,
        exports: "named"
      }
    ]
  },

  // Type definitions
  {
    input: "src/codemirror-index.ts",
    external,
    plugins: [dts()],
    output: {
      file: "dist/index.d.ts",
      format: "es"
    }
  }
];
