import { getDoctrine } from "../game/doctrines";
import {
  boardPixelBounds,
  getHex,
  hexKey,
  hexPolygonPoints,
  hexToPixel,
  sameHex,
  type BoardLayout,
  type HexCoord,
} from "../game/board";
import type { DoctrineAssignments, FactionId, Objective, PhaseEvent, Squad } from "../game/types";

const HEX_SIZE = 42;
const BOARD_PADDING = 18;

function pointList(points: { x: number; y: number }[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function terrainName(hex: ReturnType<typeof getHex>) {
  if (!hex) {
    return "unknown";
  }

  return hex.label ? `${hex.label}, ${hex.terrain} terrain` : `${hex.terrain} terrain`;
}

function coordText(coord: HexCoord) {
  return `${coord.q},${coord.r}`;
}

const numberWordCodes: Record<string, string> = {
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
};

function wordsForToken(name: string) {
  return name
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

function baseTokenCode(squad: Squad) {
  const words = wordsForToken(squad.name);
  const lastWord = words.at(-1)?.toLowerCase();

  if (lastWord && numberWordCodes[lastWord] && words[0]) {
    return `${words[0][0]}${numberWordCodes[lastWord]}`.toUpperCase();
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }

  return squad.role.slice(0, 2).toUpperCase();
}

function tokenCodesForSquads(squads: Squad[]) {
  const groups = new Map<string, Squad[]>();
  const codes = new Map<string, string>();
  const used = new Set<string>();
  const suffixes = "123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  for (const squad of squads) {
    const base = baseTokenCode(squad);
    groups.set(base, [...(groups.get(base) ?? []), squad]);
  }

  for (const [base, groupedSquads] of groups) {
    if (groupedSquads.length === 1 && !used.has(base)) {
      codes.set(groupedSquads[0].id, base);
      used.add(base);
      continue;
    }

    groupedSquads.forEach((squad, index) => {
      const prefix = base[0] ?? "U";
      let suffixIndex = index;
      let code = `${prefix}${suffixes[suffixIndex] ?? "X"}`;

      while (used.has(code) && suffixIndex < suffixes.length - 1) {
        suffixIndex += 1;
        code = `${prefix}${suffixes[suffixIndex]}`;
      }

      codes.set(squad.id, code);
      used.add(code);
    });
  }

  return codes;
}

function canDeployToHex({
  board,
  coord,
  squads,
  playerFaction,
  deploymentLocked,
}: {
  board: BoardLayout;
  coord: HexCoord;
  squads: Squad[];
  playerFaction: FactionId;
  deploymentLocked: boolean;
}) {
  const hex = getHex(board, coord);
  const occupied = squads.some((squad) => squad.hex && sameHex(squad.hex, coord));

  return Boolean(hex && !deploymentLocked && !occupied && hex.deploymentFaction === playerFaction && !hex.objectiveId);
}

export function HexBoard({
  board,
  squads,
  assignments,
  objectives,
  playerFaction,
  phaseEvents = [],
  activePhaseEvent,
  selectedSquadId,
  deploymentLocked = false,
  onSelectSquad,
  onDeploySquad,
}: {
  board: BoardLayout;
  squads: Squad[];
  assignments: DoctrineAssignments;
  objectives: Objective[];
  playerFaction: FactionId;
  phaseEvents?: PhaseEvent[];
  activePhaseEvent?: PhaseEvent;
  selectedSquadId?: string | null;
  deploymentLocked?: boolean;
  onSelectSquad?: (squadId: string) => void;
  onDeploySquad?: (squadId: string, coord: HexCoord) => void;
}) {
  const bounds = boardPixelBounds(board, HEX_SIZE);
  const width = bounds.maxX - bounds.minX + BOARD_PADDING * 2;
  const height = bounds.maxY - bounds.minY + BOARD_PADDING * 2;
  const translate = (coord: HexCoord) => {
    const point = hexToPixel(coord, HEX_SIZE);

    return {
      x: point.x - bounds.minX + BOARD_PADDING,
      y: point.y - bounds.minY + BOARD_PADDING,
    };
  };
  const selectedSquad = squads.find((squad) => squad.id === selectedSquadId);
  const tokenCodes = tokenCodesForSquads(squads);

  return (
    <div className="hex-board-wrap">
      <svg
        className="hex-board"
        role="img"
        aria-label="Tessellated hex battlefield"
        viewBox={`0 0 ${width} ${height}`}
      >
        <g className="hex-tiles">
          {board.hexes.map((hex) => {
            const center = translate(hex.coord);
            const isDeployable = Boolean(
              selectedSquad &&
                selectedSquad.faction === playerFaction &&
                canDeployToHex({
                  board,
                  coord: hex.coord,
                  squads,
                  playerFaction,
                  deploymentLocked,
                }),
            );
            const label = isDeployable
              ? `Deploy ${selectedSquad?.name} to hex ${coordText(hex.coord)}`
              : `Hex ${coordText(hex.coord)}: ${terrainName(hex)}`;

            return (
              <g
                aria-label={label}
                className={`hex-tile terrain-${hex.terrain} ${isDeployable ? "deployable" : ""}`}
                data-testid="hex-tile"
                key={hexKey(hex.coord)}
                onClick={() => {
                  if (isDeployable && selectedSquad) {
                    onDeploySquad?.(selectedSquad.id, hex.coord);
                  }
                }}
                role={isDeployable ? "button" : undefined}
                tabIndex={isDeployable ? 0 : undefined}
              >
                <polygon points={pointList(hexPolygonPoints(center, HEX_SIZE))} />
              </g>
            );
          })}
        </g>
        <g className="phase-indicators">
          {phaseEvents.map((event, index) => {
            const activeClass = event === activePhaseEvent ? "active pulsing" : "static";

            if (event.kind === "engagement") {
              const center = translate(event.targetHex);

              return (
                <g
                  aria-label={`Engagement at hex ${coordText(event.targetHex)}`}
                  className={`phase-indicator engagement ${activeClass}`}
                  key={`engagement-${index}-${coordText(event.targetHex)}`}
                >
                  <circle cx={center.x} cy={center.y} r="29" />
                  <text aria-hidden="true" x={center.x} y={center.y + 4}>
                    Clash
                  </text>
                </g>
              );
            }

            if (event.kind === "support") {
              const source = squads.find((squad) => squad.id === event.sourceSquadId);
              const sourceCenter = source?.hex ? translate(source.hex) : undefined;

              return (
                <g
                  aria-label={`Support from ${source?.name ?? event.sourceSquadId}`}
                  className={`phase-indicator support ${activeClass}`}
                  key={`support-${index}-${event.sourceSquadId}`}
                >
                  {sourceCenter && (
                    <circle className="support-source" cx={sourceCenter.x} cy={sourceCenter.y} r="31" />
                  )}
                  {event.affectedHexes.map((coord) => {
                    const center = translate(coord);

                    return (
                      <circle
                        aria-label={`Support effect at hex ${coordText(coord)}`}
                        className="support-area"
                        cx={center.x}
                        cy={center.y}
                        key={coordText(coord)}
                        r="25"
                      />
                    );
                  })}
                </g>
              );
            }

            const center = translate(event.hex);

            return (
              <g
                aria-label={`Objective damage at hex ${coordText(event.hex)}`}
                className={`phase-indicator objective-damage ${activeClass}`}
                key={`objective-${index}-${event.objectiveId}`}
              >
                <circle cx={center.x} cy={center.y} r="27" />
                <text aria-hidden="true" x={center.x} y={center.y + 4}>
                  Hit
                </text>
              </g>
            );
          })}
        </g>
        <g className="objective-markers">
          {board.hexes
            .filter((hex) => hex.objectiveId)
            .map((hex) => {
              const center = translate(hex.coord);
              const objective = objectives.find((item) => item.id === hex.objectiveId);

              return (
                <g
                  aria-label={`Objective ${objective?.name ?? hex.objectiveId} at hex ${coordText(hex.coord)}`}
                  className="objective-marker"
                  key={hex.objectiveId}
                >
                  <rect x={center.x - 18} y={center.y - 28} width="36" height="56" rx="5" />
                  <text aria-hidden="true" x={center.x} y={center.y + 4}>
                    Gate
                  </text>
                </g>
              );
            })}
        </g>
        <g className="squad-tokens">
          {squads.map((squad) => {
            if (!squad.hex || !getHex(board, squad.hex)) {
              return null;
            }

            const center = translate(squad.hex);
            const isPlayer = squad.faction === playerFaction;
            const doctrine = getDoctrine(isPlayer ? assignments[squad.id] : squad.assignedDoctrineId);
            const selected = selectedSquadId === squad.id;
            const tokenCode = tokenCodes.get(squad.id) ?? baseTokenCode(squad);
            const label = isPlayer
              ? `Select ${squad.name} at hex ${coordText(squad.hex)}, ${squad.role}, ${doctrine.name}`
              : `${squad.name} at hex ${coordText(squad.hex)}, ${squad.role}, ${doctrine.name}`;

            return (
              <g
                aria-label={label}
                className={`hex-squad ${isPlayer ? "banner" : "ashen"} role-${squad.role} ${selected ? "selected" : ""}`}
                data-q={squad.hex.q}
                data-r={squad.hex.r}
                data-role={squad.role}
                key={squad.id}
                onClick={() => {
                  if (isPlayer) {
                    onSelectSquad?.(squad.id);
                  }
                }}
                role={isPlayer ? "button" : undefined}
                tabIndex={isPlayer ? 0 : undefined}
              >
                <circle className="token-body" cx={center.x} cy={center.y} r="18" />
                <circle className="token-role" cx={center.x + 12} cy={center.y - 12} r="5" />
                <text aria-hidden="true" data-testid="squad-token-label" x={center.x} y={center.y + 4}>
                  {tokenCode}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
