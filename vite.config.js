import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
    plugins: [basicSsl()],
    server: {
        port: 55555,
        https: true,
        proxy: {
            '/bungie': {
                target: 'https://www.bungie.net',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/bungie/, ''),
                secure: false,
                configure: (proxy, _options) => {
                    proxy.on('proxyReq', (proxyReq, req, _res) => {
                        // ELIMINAR Rastros de Origen: Hacemos creer a Bungie que es una petición directa de servidor
                        proxyReq.removeHeader('Origin');
                        proxyReq.removeHeader('Referer');
                    });
                }
            }
        }
    }
});
