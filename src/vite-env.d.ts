/// <reference types="vite/client" />

interface DoctrineOfWarPreload {
  platform: string;
  /** Electron only: the campaign save file in userData. */
  saves?: {
    read(): Promise<string | null>;
    write(data: string): Promise<void>;
    /** Settings → Support: a copy of the save, to a path the user picks (T19). */
    export?(): Promise<{ exported: boolean; reason?: string }>;
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
