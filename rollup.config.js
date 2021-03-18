import typescriptPlugin from 'rollup-plugin-typescript2';
import sourcemaps from 'rollup-plugin-sourcemaps';
import rollupPluginCommonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from 'typescript';
import replace from '@rollup/plugin-replace';
import autoPreprocess from 'svelte-preprocess';
import svelte from 'rollup-plugin-svelte';

const rollupConfig = {
    input: './app/entry.ts',
    context: 'window',
    output: {
        file: `./dist/app.js`,
        sourcemap: true,
        format: 'iife',
    },
    plugins: [
        svelte({
            extensions: ['.svelte'],
            compilerOptions: {
                dev: true
            },
            preprocess: autoPreprocess({sourceMap:true}),
        }),
        resolve({
			browser: true,
			dedupe: ['svelte']
        }),
        rollupPluginCommonjs(),
        typescriptPlugin({
            typescript: typescript,
            tsconfig: 'tsconfig.json',
            objectHashIgnoreUnknownHack: true,
        }),
        sourcemaps(),
        replace({
            'process.env.NODE_ENV': JSON.stringify('development'),
            'process.env.basePath': process.env.basePath || JSON.stringify('/'),
        }),
    ]
};

export default rollupConfig;