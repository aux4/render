import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";

// aux4/render is authored in executable.js (Node builtins + js-yaml). Rollup bundles
// it — together with its npm dependencies — into a single self-contained ESM file at
// package/lib/aux4-render.mjs, which is the artifact that ships in the package and is
// executed by package/.aux4. This mirrors the build used by aux4/2table and
// aux4/template, so the command works after a normal aux4 package install (no
// node_modules present at runtime).
export default {
  input: "executable.js",
  output: {
    file: "package/lib/aux4-render.mjs",
    format: "esm",
    inlineDynamicImports: true,
    banner: "// GENERATED FILE — do not edit. Edit executable.js at the package root and run `npm run build`."
  },
  plugins: [
    json(),
    nodeResolve({
      preferBuiltins: true
    }),
    commonjs()
  ],
  external: ["fs", "child_process"]
};
