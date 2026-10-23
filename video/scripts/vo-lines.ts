// For temp-vo.sh: one "id<TAB>text to say" line per VO line in script.ts.
import { SHOTS } from "../src/script";

for (const shot of SHOTS) if (shot.vo) console.log(`${shot.vo.id}\t${shot.vo.say ?? shot.vo.text}`);
