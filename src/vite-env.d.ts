/// <reference types="vite/client" />

interface DoctrineOfWarPreload {
  platform: string;
  /** Electron only: the campaign save files in userData (an optional allowlisted campaign id; default the intro). */
  saves?: {
    read(campaignId?: string): Promise<string | null>;
    write(data: string, campaignId?: string): Promise<void>;
    /** M1: a v2 campaign's backup, and setting its save aside. */
    readBackup?(campaignId: string): Promise<string | null>;
    setAside?(campaignId: string): Promise<void>;
    /** Settings → Support: a copy of the save, to a path the user picks (T19). */
    export?(campaignId?: string): Promise<{ exported: boolean; reason?: string }>;
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
