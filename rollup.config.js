import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import dts from "rollup-plugin-dts";

// Don't bundle these (they should be deps/peers of the consumer)
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

// Shared JS build plugins
const jsPlugins = [
  resolve({
    extensions: [".mjs", ".js", ".json", ".ts"]
  }),
  commonjs(),
  typescript({
    tsconfig: "./tsconfig.json",
    // Important: don't emit declarations here; dts() handles it separately
    declaration: false,
    declarationMap: false
  })
];

export default [
  // Parser only (Lezer-style parser without CodeMirror integration)
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

  // Full CodeMirror integration
  {
    input: "src/codemirror.ts",
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

  // Type definitions for parser entry
  {
    input: "src/index.ts",
    external,
    plugins: [dts()],
    output: {
      file: "dist/parser.d.ts",
      format: "es"
    }
  },

  // Type definitions for full package entry
  {
    input: "src/codemirror.ts",
    external,
    plugins: [dts()],
    output: {
      file: "dist/index.d.ts",
      format: "es"
    }
  }
];
