// =============================================================================
// lln-graph — DependencyGraph
//
// Task execution dependency graph with cycle detection and topological sort.
// Replaces logicn-core-tasks/src/dependency-graph.ts.
//
// Error codes updated to LLN-GRAPH-* format for consistency.
// =============================================================================

import { GraphBuilder } from "../core/builder.js";
import { topoSort } from "../algorithms/topo.js";
import type { Graph, LlnDiagnostic } from "../core/types.js";
import { LLN_GRAPH_001, LLN_GRAPH_003 } from "../core/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskNodeData {
  readonly taskName: string;
  readonly description?: string;
  readonly effects?: readonly string[];
}

export interface DependencyEdgeData {
  readonly required: boolean;
}

export type DependencyGraph = Graph<TaskNodeData, DependencyEdgeData>;

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export interface TaskEntry {
  readonly name: string;
  readonly description?: string;
  readonly effects?: readonly string[];
  /** Names of tasks that must complete before this task runs. */
  readonly depends?: readonly string[];
}

/**
 * Build a DependencyGraph from a list of task entries.
 * Missing dependency targets are recorded as diagnostics (LLN-GRAPH-003).
 */
export function buildDependencyGraph(tasks: readonly TaskEntry[]): {
  graph: DependencyGraph;
  diagnostics: LlnDiagnostic[];
} {
  const diagnostics: LlnDiagnostic[] = [];
  const builder = new GraphBuilder<TaskNodeData, DependencyEdgeData>();
  const knownNames = new Set(tasks.map((t) => t.name));

  for (const task of tasks) {
    builder.addNode(task.name, {
      taskName: task.name,
      description: task.description,
      effects: task.effects ?? [],
    });
  }

  for (const task of tasks) {
    for (const dep of task.depends ?? []) {
      if (!knownNames.has(dep)) {
        diagnostics.push({
          ...LLN_GRAPH_003,
          message: `Task "${task.name}" depends on "${dep}" which is not declared.`,
        });
        continue;
      }
      // Edge direction: task depends on dep → dep must run before task
      // Edge goes dep → task (dep is a prerequisite of task).
      builder.addEdge(dep, task.name, { required: true });
    }
  }

  return { graph: builder.build(), diagnostics };
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export type DependencyResolution =
  | { readonly ok: true; readonly order: readonly string[] }
  | {
      readonly ok: false;
      readonly order: readonly string[];
      readonly cycle: readonly string[];
      readonly diagnostic: LlnDiagnostic;
    };

/**
 * Resolve the execution order for all tasks in the graph.
 * Uses topoSort (Kahn's algorithm) for deterministic ordering.
 *
 * Returns ok:true with the task names in execution order (dependencies first).
 * Returns ok:false with the cycle when the graph is not a DAG.
 */
export function resolveDependencies(graph: DependencyGraph): DependencyResolution {
  const result = topoSort(graph);

  if (result.ok) {
    return { ok: true, order: result.order };
  }

  return {
    ok: false,
    order: result.order,
    cycle: result.cycle,
    diagnostic: {
      ...LLN_GRAPH_001,
      message: `Circular dependency detected between tasks: ${result.cycle.join(" → ")}.`,
    },
  };
}
