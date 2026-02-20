import { defineConfig } from 'astro/config'
import icon from 'astro-icon'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// https://astro.build/config
export default defineConfig({
  output: 'static',
  integrations: [icon()],

  vite: {
    resolve: {
      alias: {
        '@scripts': resolve(__dirname, 'src', 'scripts'),
        '@components': resolve(__dirname, 'src', 'components'),
        '@styles': resolve(__dirname, 'src', 'styles'),
        '@layouts': resolve(__dirname, 'src', 'layouts'),
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler',
        }
      }
    }
  },

  

  markdown: {
    syntaxHighlight: false,
  },

  redirects: {
    // Home page
    '/hi': '/hello',
    '/good-morning': '/hello',
    '/good-afternoon': '/hello',
    '/good-evening': '/hello',
    '/about': '/hello',
    '/welcome': '/hello',

    // Example note
    '/example': '/note/example',

    // External redirects
    '/git': 'https://github.com/nycalexander/type'

  },

  devToolbar: {
    enabled: false
  },
});