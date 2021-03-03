import typescriptPlugin from 'rollup-plugin-typescript2';
import sourcemaps from 'rollup-plugin-sourcemaps';
import rollupPluginCommonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from 'typescript';
import replace from '@rollup/plugin-replace';

console.log(process.env.basePath);
console.log('development');
console.log(JSON.stringify('development'));
console.log(JSON.stringify('/'));

const rollupConfig = {
    input: './app/entry.tsx',
    context: 'window',
    output: {
        file: `./dist/app.js`,
        sourcemap: true,
        format: 'iife',
    },
    plugins: [
        resolve(),
        rollupPluginCommonjs(),
        typescriptPlugin({
            typescript: typescript,
            tsconfig: 'tsconfig.json',
        }),
        sourcemaps(),
        replace({
            'process.env.NODE_ENV': JSON.stringify('development'),
            'process.env.basePath': process.env.basePath || JSON.stringify('/'),
        }),
    ]
};

export default rollupConfig;