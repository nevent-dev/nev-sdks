import { resolve } from 'path';
import { build, defineConfig, normalizePath } from 'vite';
import type { UserConfig } from 'vite';

const bundleConfig = {
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'NeventChatbot',
    },
    sourcemap: true,
    minify: 'esbuild',
    target: 'es2020',
  },
  esbuild: {
    drop: ['debugger'],
    pure: ['console.log', 'console.debug'],
    legalComments: 'none',
    treeShaking: true,
  },
  resolve: {
    alias: {
      '@nevent/core': resolve(__dirname, '../core/src/index.ts'),
    },
  },
} satisfies UserConfig;

export default defineConfig({
  ...bundleConfig,
  build: {
    ...bundleConfig.build,
    rollupOptions: {
      output: [
        {
          format: 'es',
          entryFileNames: 'nevent-chatbot.js',
          chunkFileNames: 'locales/[name]-[hash].js',
          compact: true,
        },
      ],
    },
  },
  plugins: [
    {
      name: 'chatbot-umd',
      async writeBundle(_, bundle) {
        // UMD cannot emit split chunks. Refer to the ESM build's hashed catalogs
        // as external dynamic imports from the same distribution directory.
        const localeChunks = new Map<string, string>();
        for (const chunk of Object.values(bundle)) {
          if (
            chunk.type === 'chunk' &&
            chunk.isDynamicEntry &&
            chunk.fileName.startsWith('locales/')
          ) {
            localeChunks.set(`./locales/${chunk.name}`, `./${chunk.fileName}`);
          }
        }

        await build({
          ...bundleConfig,
          configFile: false,
          plugins: [
            {
              name: 'chatbot-umd-locales',
              enforce: 'pre',
              resolveId(source, importer) {
                if (
                  importer !==
                  normalizePath(
                    resolve(__dirname, 'src/chatbot/i18n-manager.ts')
                  )
                )
                  return;
                const chunk = localeChunks.get(source);
                if (chunk) return { id: chunk, external: true };
              },
            },
          ],
          build: {
            ...bundleConfig.build,
            emptyOutDir: false,
            rollupOptions: {
              makeAbsoluteExternalsRelative: false,
              output: [
                {
                  format: 'umd',
                  name: 'NeventChatbot',
                  entryFileNames: 'nevent-chatbot.umd.cjs',
                  compact: true,
                  intro: `const chatbotScriptUrl = typeof document !== 'undefined' && document.currentScript?.src;`,
                  plugins: [
                    {
                      name: 'chatbot-umd-relative-imports',
                      renderDynamicImport({ targetModuleId }) {
                        if (!targetModuleId?.startsWith('./locales/')) return;
                        // A classic script loaded without crossorigin can have the
                        // page as its import base. Resolve against the SDK script.
                        return {
                          left: `(chatbotScriptUrl ? import(new URL(${JSON.stringify(targetModuleId)}, chatbotScriptUrl).href) : import(`,
                          right: '))',
                        };
                      },
                    },
                  ],
                },
              ],
            },
          },
        });
      },
    },
  ],
});
