# v1 save fixture corpus

Campaign saves written by the **v1.0-intro** build itself (tag `v1.0-intro`), not by
current code: fresh, after a defeat, a retried tutorial, mid-campaign with custom orders
(T16), a stalemate, and a complete run with renown. `saveFiles.test.ts` proves every one
loads through the current app, re-saves byte for byte, and routes to the original file and
localStorage key. Never regenerate them from current code; add new ones from the tag.
