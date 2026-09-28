/// <reference types="vite/client" />

interface DoctrineOfWarPreload {
  platform: string;
}

interface Window {
  doctrineOfWar?: DoctrineOfWarPreload;
}
