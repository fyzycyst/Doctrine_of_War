import { getDoctrine } from "./doctrines";
import { firstBreachScenario } from "./scenario";
import type {
  BattleEvent,
  BattleReport,
  BattleState,
  Doctrine,
  DoctrineAssignments,
  Scenario,
  Squad,
} from "./types";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const cloneSquad = (squad: Squad): Squad => ({ ...squad });

const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((item) => [item.id, item]));

function resolveScore(squad: Squad, doctrine: Doctrine): number {
  return squad.strength * 0.04 + squad.cohesion * 0.05 + squad.resolve * 3 + doctrine.defenseBias;
}

function counterScore(squad: Squad, doctrine: Doctrine): number {
  return Math.max(0, squad.strength * 0.03 + squad.resolve * 1.5 + doctrine.counterBias);
}

function applySupport(squads: Squad[], phase: number, report: BattleReport, events: BattleEvent[]) {
  const supportSquads = squads.filter(
    (squad) =>
      squad.faction === "free_banners" && getDoctrine(squad.assignedDoctrineId).formation === "support",
  );

  for (const support of supportSquads) {
    const allies = squads
      .filter((squad) => squad.faction === "free_banners" && squad.id !== support.id)
      .sort((a, b) => a.cohesion - b.cohesion);
    const target = allies[0];

    if (!target) {
      continue;
    }

    const doctrine = getDoctrine(support.assignedDoctrineId);
    const restored = clamp(Math.round(6 + doctrine.cohesionBias * 0.25 + support.resolve), 3, 12);
    target.cohesion = clamp(target.cohesion + restored, 0, 100);
    support.cohesion = clamp(support.cohesion - 2, 0, 100);
    report.cohesionChanges.push(`${support.name} restored ${restored} cohesion to ${target.name}.`);
    report.notes.push(`${doctrine.name} kept ${target.name} steadier before the Host impact landed.`);
    events.push({
      phase,
      faction: "free_banners",
      kind: "support",
      message: `${support.name} raised the standard near ${target.name}.`,
    });
  }
}

export function resolvePhase(
  state: BattleState,
  assignments: DoctrineAssignments,
  scenario: Scenario = firstBreachScenario,
): BattleState {
  if (state.status !== "command") {
    return state;
  }

  const phaseScript = scenario.scriptedOpponent.find((phase) => phase.phase === state.currentPhase);

  if (!phaseScript) {
    throw new Error(`No scripted opponent phase for phase ${state.currentPhase}`);
  }

  const squads = state.squads.map(cloneSquad);
  const squadMap = byId(squads);
  const objectives = state.objectives.map((objective) => ({ ...objective }));
  const primaryObjective = objectives[0];
  const report: BattleReport = {
    phase: state.currentPhase,
    title: `Phase ${state.currentPhase}: ${phaseScript.hostIntent}`,
    casualties: [],
    cohesionChanges: [],
    objectiveChanges: [],
    notes: [],
  };
  const events: BattleEvent[] = [
    ...state.events,
    {
      phase: state.currentPhase,
      faction: scenario.initiativeSide,
      kind: "initiative",
      message: phaseScript.hostIntent,
    },
  ];

  for (const [squadId, doctrineId] of Object.entries(assignments)) {
    const squad = squadMap.get(squadId);
    const doctrine = scenario.doctrines.find((item) => item.id === doctrineId);

    if (!squad || !doctrine || squad.faction !== doctrine.faction) {
      throw new Error(`Invalid doctrine assignment: ${squadId} -> ${doctrineId}`);
    }

    squad.assignedDoctrineId = doctrineId;
  }

  applySupport(squads, state.currentPhase, report, events);

  for (const threat of phaseScript.threats) {
    const attacker = squadMap.get(threat.attackerSquadId);

    if (!attacker || attacker.strength <= 0) {
      continue;
    }

    const defenders = squads.filter(
      (squad) => squad.faction === "free_banners" && squad.laneId === threat.laneId && squad.strength > 0,
    );
    const lane = scenario.lanes.find((item) => item.id === threat.laneId);
    const attackerPower = threat.pressure + attacker.strength * 0.08 + attacker.resolve * 2;
    const defensePower = defenders.reduce((sum, defender) => {
      const doctrine = getDoctrine(defender.assignedDoctrineId);
      return sum + resolveScore(defender, doctrine);
    }, 0);
    const counterPower = defenders.reduce((sum, defender) => {
      const doctrine = getDoctrine(defender.assignedDoctrineId);
      return sum + counterScore(defender, doctrine);
    }, 0);
    const withdrawalPenalty = defenders.some(
      (defender) => getDoctrine(defender.assignedDoctrineId).formation === "withdraw",
    )
      ? 5
      : 0;
    const pressureGap = attackerPower - defensePower;
    const objectiveDamage = clamp(Math.round(pressureGap * 0.48 + withdrawalPenalty), 0, 28);
    const oldIntegrity = primaryObjective.integrity;
    primaryObjective.integrity = clamp(primaryObjective.integrity - objectiveDamage, 0, 100);

    if (objectiveDamage > 0) {
      report.objectiveChanges.push(
        `${primaryObjective.name} lost ${objectiveDamage} integrity at ${lane?.name ?? threat.laneId}.`,
      );
    } else {
      report.objectiveChanges.push(`${lane?.name ?? threat.laneId} held without gate damage.`);
    }

    for (const defender of defenders) {
      const doctrine = getDoctrine(defender.assignedDoctrineId);
      const stress = Math.max(4, Math.round(threat.pressure / Math.max(1, defenders.length)));
      const reliability = clamp(defender.resolve * 2 + doctrine.cohesionBias * 0.35, -10, 20);
      const cohesionLoss = clamp(Math.round(stress - reliability), 1, 22);
      const strengthLossBase = Math.max(1, Math.round((attackerPower - defensePower * 0.35) / 12));
      const strengthProtection = doctrine.formation === "withdraw" ? 4 : doctrine.formation === "hold" ? 2 : 0;
      const strengthLoss = clamp(strengthLossBase - strengthProtection - Math.max(0, defender.resolve), 0, 12);

      defender.cohesion = clamp(defender.cohesion - cohesionLoss, 0, 100);
      defender.strength = clamp(defender.strength - strengthLoss, 0, 100);

      report.casualties.push(`${defender.name} lost ${strengthLoss} strength.`);
      report.cohesionChanges.push(`${defender.name} lost ${cohesionLoss} cohesion under ${threat.note}`);

      if (doctrine.formation === "withdraw" && objectiveDamage > 0) {
        report.notes.push(`${defender.name} preserved troops, but the withdrawal yielded ground.`);
      }

      if (doctrine.formation === "hold" && objectiveDamage < Math.max(1, oldIntegrity * 0.08)) {
        report.notes.push(`${defender.name} held formation and reduced breach progress.`);
      }
    }

    const counterDamage = clamp(Math.round(counterPower * 0.18 - attacker.resolve), 0, 14);
    attacker.strength = clamp(attacker.strength - counterDamage, 0, 100);

    if (counterDamage > 0) {
      report.casualties.push(`${attacker.name} lost ${counterDamage} strength to counterfire.`);
      report.notes.push(`Counterstroke pressure punished ${attacker.name} after its advance.`);
    }

    events.push({
      phase: state.currentPhase,
      faction: "ashen_host",
      kind: "clash",
      message: `${attacker.name} pressed ${lane?.name ?? threat.laneId}.`,
    });
  }

  const allPlayerSquadsBroken = squads
    .filter((squad) => squad.faction === "free_banners")
    .every((squad) => squad.strength <= 0 || squad.cohesion <= 0);
  const reachedLastPhase = state.currentPhase >= state.maxPhases;
  const status = primaryObjective.integrity <= 0 || allPlayerSquadsBroken
    ? "defeat"
    : reachedLastPhase
      ? "victory"
      : "command";
  const nextPhase = status === "command" ? state.currentPhase + 1 : state.currentPhase;

  if (status === "victory") {
    report.notes.push("Dawn breaks with Greyford Gate still standing.");
    events.push({
      phase: state.currentPhase,
      faction: "free_banners",
      kind: "terminal",
      message: "The Free Banners held until dawn.",
    });
  }

  if (status === "defeat") {
    report.notes.push("The gate line collapses before dawn.");
    events.push({
      phase: state.currentPhase,
      faction: "ashen_host",
      kind: "terminal",
      message: "The Ashen Host forced the breach.",
    });
  }

  return {
    ...state,
    currentPhase: nextPhase,
    status,
    squads,
    objectives,
    reports: [...state.reports, report],
    events,
  };
}

