import '@fontsource/press-start-2p/latin-400.css';
import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { mountGame } from './ui/app';

registerSW({ immediate: true });

const root = document.querySelector('#app');
if (root instanceof HTMLElement) mountGame(root);
