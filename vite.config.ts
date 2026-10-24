import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({root:'apps/client',plugins:[react(),tailwindcss()],server:{port:5050,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:8787',ws:true}}},build:{outDir:'../../dist',emptyOutDir:true,chunkSizeWarningLimit:900}});
