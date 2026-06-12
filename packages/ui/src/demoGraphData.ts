import type {
  GraphEdge,
  GraphNode,
  GraphNodeKind,
  GraphNodeStatus,
  GraphPayload,
} from "./graphTypes";

type DemoNodeOptions = {
  file?: string;
  isEntry?: boolean;
  kind?: GraphNodeKind;
  name?: string;
  status?: GraphNodeStatus;
};

function node(
  id: string,
  label: string,
  path: string,
  options: DemoNodeOptions = {},
): GraphNode {
  return {
    id,
    type: "custom",
    data: {
      label,
      name: options.name,
      path,
      file: options.file,
      kind: options.kind ?? "file",
      status: options.status ?? "resolved",
      isEntry: options.isEntry ?? false,
    },
  };
}

function depEdge(
  source: string,
  target: string,
  specifier: string,
  unresolved = false,
): GraphEdge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    animated: unresolved,
    data: {
      kind: unresolved ? "unresolved" : "import",
      specifier,
      unresolved,
    },
  };
}

function callEdge(
  source: string,
  target: string,
  calleeName: string,
  kind = "call",
): GraphEdge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    animated: kind === "render",
    data: {
      calleeName,
      kind,
      unresolved: false,
    },
  };
}

export const demoDependencyGraph: GraphPayload = {
  nodes: [
    node("src/main.tsx", "main.tsx", "src/main.tsx", {
      isEntry: true,
      kind: "entry",
    }),
    node("src/app/App.tsx", "App.tsx", "src/app/App.tsx"),
    node(
      "src/routes/DashboardPage.tsx",
      "DashboardPage.tsx",
      "src/routes/DashboardPage.tsx",
    ),
    node(
      "src/components/BoardColumn.tsx",
      "BoardColumn.tsx",
      "src/components/BoardColumn.tsx",
    ),
    node(
      "src/components/TaskCard.tsx",
      "TaskCard.tsx",
      "src/components/TaskCard.tsx",
    ),
    node(
      "src/components/NewTaskDialog.tsx",
      "NewTaskDialog.tsx",
      "src/components/NewTaskDialog.tsx",
    ),
    node(
      "src/hooks/useTaskBoard.ts",
      "useTaskBoard.ts",
      "src/hooks/useTaskBoard.ts",
    ),
    node("src/lib/tasks.ts", "tasks.ts", "src/lib/tasks.ts"),
    node("src/lib/date.ts", "date.ts", "src/lib/date.ts"),
    node("pkg:react", "react", "react", { kind: "external" }),
    node("pkg:@tanstack/react-query", "@tanstack/react-query", "@tanstack/react-query", {
      kind: "external",
    }),
    node("missing:@/features/flags", "@/features/flags", "@/features/flags", {
      kind: "ghost",
      status: "unresolved",
    }),
  ],
  edges: [
    depEdge("src/main.tsx", "src/app/App.tsx", "./app/App"),
    depEdge("src/main.tsx", "pkg:react", "react"),
    depEdge("src/app/App.tsx", "src/routes/DashboardPage.tsx", "../routes/DashboardPage"),
    depEdge("src/app/App.tsx", "missing:@/features/flags", "@/features/flags", true),
    depEdge(
      "src/routes/DashboardPage.tsx",
      "src/components/BoardColumn.tsx",
      "../components/BoardColumn",
    ),
    depEdge(
      "src/routes/DashboardPage.tsx",
      "src/components/NewTaskDialog.tsx",
      "../components/NewTaskDialog",
    ),
    depEdge("src/routes/DashboardPage.tsx", "src/hooks/useTaskBoard.ts", "../hooks/useTaskBoard"),
    depEdge("src/routes/DashboardPage.tsx", "pkg:@tanstack/react-query", "@tanstack/react-query"),
    depEdge(
      "src/components/BoardColumn.tsx",
      "src/components/TaskCard.tsx",
      "./TaskCard",
    ),
    depEdge("src/components/TaskCard.tsx", "src/lib/date.ts", "../lib/date"),
    depEdge("src/components/NewTaskDialog.tsx", "src/lib/tasks.ts", "../lib/tasks"),
    depEdge("src/hooks/useTaskBoard.ts", "src/lib/tasks.ts", "../lib/tasks"),
  ],
  issues: [
    {
      id: "unresolved-feature-flags",
      file: "src/app/App.tsx",
      kind: "unresolvedImport",
      message: "Could not resolve '@/features/flags'. Toggle ghost nodes to inspect the unresolved dependency.",
    },
  ],
};

export const demoCallGraph: GraphPayload = {
  nodes: [
    node("src/app/App.tsx#App", "App", "src/app/App.tsx#App", {
      file: "src/app/App.tsx",
      isEntry: true,
      kind: "function",
      name: "App",
    }),
    node(
      "src/routes/DashboardPage.tsx#DashboardPage",
      "DashboardPage",
      "src/routes/DashboardPage.tsx#DashboardPage",
      {
        file: "src/routes/DashboardPage.tsx",
        kind: "function",
        name: "DashboardPage",
      },
    ),
    node(
      "src/hooks/useTaskBoard.ts#useTaskBoard",
      "useTaskBoard",
      "src/hooks/useTaskBoard.ts#useTaskBoard",
      {
        file: "src/hooks/useTaskBoard.ts",
        kind: "function",
        name: "useTaskBoard",
      },
    ),
    node("src/lib/tasks.ts#loadTasks", "loadTasks", "src/lib/tasks.ts#loadTasks", {
      file: "src/lib/tasks.ts",
      kind: "function",
      name: "loadTasks",
    }),
    node(
      "src/lib/tasks.ts#calculateBurndown",
      "calculateBurndown",
      "src/lib/tasks.ts#calculateBurndown",
      {
        file: "src/lib/tasks.ts",
        kind: "function",
        name: "calculateBurndown",
      },
    ),
    node(
      "src/components/BoardColumn.tsx#BoardColumn",
      "BoardColumn",
      "src/components/BoardColumn.tsx#BoardColumn",
      {
        file: "src/components/BoardColumn.tsx",
        kind: "function",
        name: "BoardColumn",
      },
    ),
    node(
      "src/components/TaskCard.tsx#TaskCard",
      "TaskCard",
      "src/components/TaskCard.tsx#TaskCard",
      {
        file: "src/components/TaskCard.tsx",
        kind: "function",
        name: "TaskCard",
      },
    ),
    node(
      "src/components/TaskCard.tsx#formatDueDate",
      "formatDueDate",
      "src/components/TaskCard.tsx#formatDueDate",
      {
        file: "src/components/TaskCard.tsx",
        kind: "function",
        name: "formatDueDate",
      },
    ),
    node(
      "src/components/NewTaskDialog.tsx#NewTaskDialog",
      "NewTaskDialog",
      "src/components/NewTaskDialog.tsx#NewTaskDialog",
      {
        file: "src/components/NewTaskDialog.tsx",
        kind: "function",
        name: "NewTaskDialog",
      },
    ),
    node(
      "src/components/NewTaskDialog.tsx#handleSubmit",
      "handleSubmit",
      "src/components/NewTaskDialog.tsx#handleSubmit",
      {
        file: "src/components/NewTaskDialog.tsx",
        kind: "arrowFunction",
        name: "handleSubmit",
      },
    ),
    node("src/lib/tasks.ts#createTask", "createTask", "src/lib/tasks.ts#createTask", {
      file: "src/lib/tasks.ts",
      kind: "function",
      name: "createTask",
    }),
  ],
  edges: [
    callEdge("src/app/App.tsx#App", "src/routes/DashboardPage.tsx#DashboardPage", "DashboardPage", "render"),
    callEdge(
      "src/routes/DashboardPage.tsx#DashboardPage",
      "src/hooks/useTaskBoard.ts#useTaskBoard",
      "useTaskBoard",
    ),
    callEdge(
      "src/routes/DashboardPage.tsx#DashboardPage",
      "src/components/BoardColumn.tsx#BoardColumn",
      "BoardColumn",
      "render",
    ),
    callEdge(
      "src/routes/DashboardPage.tsx#DashboardPage",
      "src/components/NewTaskDialog.tsx#NewTaskDialog",
      "NewTaskDialog",
      "render",
    ),
    callEdge(
      "src/hooks/useTaskBoard.ts#useTaskBoard",
      "src/lib/tasks.ts#loadTasks",
      "loadTasks",
    ),
    callEdge(
      "src/hooks/useTaskBoard.ts#useTaskBoard",
      "src/lib/tasks.ts#calculateBurndown",
      "calculateBurndown",
    ),
    callEdge(
      "src/components/BoardColumn.tsx#BoardColumn",
      "src/components/TaskCard.tsx#TaskCard",
      "TaskCard",
      "render",
    ),
    callEdge(
      "src/components/TaskCard.tsx#TaskCard",
      "src/components/TaskCard.tsx#formatDueDate",
      "formatDueDate",
    ),
    callEdge(
      "src/components/NewTaskDialog.tsx#NewTaskDialog",
      "src/components/NewTaskDialog.tsx#handleSubmit",
      "handleSubmit",
    ),
    callEdge(
      "src/components/NewTaskDialog.tsx#handleSubmit",
      "src/lib/tasks.ts#createTask",
      "createTask",
    ),
    callEdge("src/lib/tasks.ts#createTask", "src/lib/tasks.ts#loadTasks", "loadTasks"),
  ],
  issues: [],
};
