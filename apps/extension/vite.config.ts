import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const rootDir = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(rootDir, 'dist');

function extensionAssets(): Plugin {
  return {
    name: 'extension-assets',
    async closeBundle() {
      await mkdir(distDir, { recursive: true });

      const manifest = JSON.parse(
        await readFile(resolve(rootDir, 'manifest.json'), 'utf8'),
      ) as {
        background?: { service_worker?: string };
      };

      if (manifest.background) {
        manifest.background.service_worker = 'background.js';
      }

      await writeFile(
        resolve(distDir, 'manifest.json'),
        `${JSON.stringify(manifest, null, 2)}\n`,
      );
      await copyFile(resolve(rootDir, 'error.html'), resolve(distDir, 'error.html'));
    },
  };
}

export default defineConfig({
  build: {
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(rootDir, 'src/background.ts'),
        options: resolve(rootDir, 'options.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
  plugins: [extensionAssets()],
});
