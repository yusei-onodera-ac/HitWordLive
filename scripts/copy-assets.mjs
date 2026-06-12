import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('dist/public', { recursive: true });
copyFileSync('index.html', 'dist/public/index.html');
copyFileSync('src/styles.css', 'dist/public/styles.css');
copyFileSync('dist/src/main.js', 'dist/public/main.js');
