/// <reference types="vite/client" />

interface DoctrineOfWarPreload {
  platform: string;
  /** Electron only: the campaign save file in userData. */
  saves?: {
    read(): Promise<string | null>;
    write(data: string): Promise<void>;
  };
  /** Electron only: the doctrine variants file in userData (T16). */
  variants?: {
    read(): Promise<string | null>;
    write(data: string): Promise<void>;
  };
}

interface Window {
  doctrineOfWar?: DoctrineOfWarPreload;
}
