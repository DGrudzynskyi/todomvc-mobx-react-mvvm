import typescriptPlugin from 'rollup-plugin-typescript2';
import sourcemaps from 'rollup-plugin-sourcemaps';
import rollupPluginCommonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from 'typescript';
import replace from '@rollup/plugin-replace';
import html from '@rollup/plugin-html';

import fs from 'fs';
import path from 'path';
const indexSource = path.resolve('./app/index.html');

const rollupConfig = {
    input: './app/entry.tsx',
    context: 'window',
    output: {
        dir: './dist',
        entryFileNames: '[name]-[hash].js',
        sourcemap: true,
        format: 'esm',
    },
    manualChunks(id) {
        if (id.includes('node_modules') || id.includes('commonjsHelpers')) {
            return 'vendor';
        } else {
            return 'app';
        }
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
        html({
            publicPath: './',
            fileName:'index.html',
            template: ({ attributes, bundle, files, publicPath, title }) => {
                const entryFileName = Object.keys(bundle).filter(x => bundle[x].isEntry)[0];
                const templateStr = fs.readFileSync(indexSource, 'utf8');
                const templateWithReplacedEntry = templateStr.replace('{{entry}}', publicPath + entryFileName);
                
                return templateWithReplacedEntry;
            }
        }),
    ]
};

export default rollupConfig;