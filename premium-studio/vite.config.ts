import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({plugins:[react(),tailwindcss()],base:'/premium-studio/',build:{outDir:'../public/premium-studio',emptyOutDir:true,sourcemap:false},server:{proxy:{'/api':'http://127.0.0.1:7000','/health':'http://127.0.0.1:7000'}}});
