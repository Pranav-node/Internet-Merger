import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://internetmerger.com',
  output: 'static',
  build: {
    format: 'directory',
  },
  vite: {
    plugins: [
      {
        name: 'set-download-headers',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url && req.url.includes('.zip')) {
              res.setHeader('Content-Disposition', 'attachment; filename="InternetMerger-windows.zip"');
              res.setHeader('Content-Type', 'application/zip');
            }
            next();
          });
        },
      },
    ],
  },
});
