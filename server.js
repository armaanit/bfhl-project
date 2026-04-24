const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// ── Personal credentials ─────────────────────────────────────────────────────
const USER_ID = "yourname_ddmmyyyy"; // ← replace with your fullname_ddmmyyyy
const EMAIL_ID = "you@college.edu"; // ← replace with your college email
const ROLL_NO = "RA2211000000000"; // ← replace with your roll number
// ─────────────────────────────────────────────────────────────────────────────

// Checks if an entry is a valid X->Y edge (single uppercase letters)
function parseEdge(raw) {
  const entry = raw.trim();

  // Must match exactly "A->B" — one uppercase letter, arrow, one uppercase letter
  const pattern = /^([A-Z])->([A-Z])$/;
  const match = entry.match(pattern);
  if (!match) return null;

  const [, parent, child] = match;
  if (parent === child) return null; // self-loops are invalid

  return { parent, child };
}

// Recursively builds a nested tree object from an adjacency map
function buildNestedTree(node, adjacency) {
  const children = adjacency[node] || [];
  const result = {};
  for (const child of children) {
    result[child] = buildNestedTree(child, adjacency);
  }
  return result;
}

// Depth-first search to find the longest root-to-leaf path length
function calcDepth(node, adjacency) {
  const kids = adjacency[node];
  if (!kids || kids.length === 0) return 1;
  return 1 + Math.max(...kids.map((k) => calcDepth(k, adjacency)));
}

// Detects a cycle using DFS with a recursion stack
function hasCycle(node, adjacency, visited, stack) {
  visited.add(node);
  stack.add(node);

  for (const neighbor of adjacency[node] || []) {
    if (!visited.has(neighbor)) {
      if (hasCycle(neighbor, adjacency, visited, stack)) return true;
    } else if (stack.has(neighbor)) {
      return true;
    }
  }

  stack.delete(node);
  return false;
}

// Collects all nodes reachable from a starting node
function collectGroup(node, adjacency, reverseAdj, visited) {
  const group = new Set();
  const queue = [node];

  while (queue.length) {
    const curr = queue.shift();
    if (group.has(curr)) continue;
    group.add(curr);

    for (const child of adjacency[curr] || []) {
      if (!group.has(child)) queue.push(child);
    }
    for (const parent of reverseAdj[curr] || []) {
      if (!group.has(parent)) queue.push(parent);
    }
  }

  visited.add(...group);
  return group;
}

function processData(dataArray) {
  const invalidEntries = [];
  const duplicateEdges = [];
  const seenEdges = new Set();
  const childSet = new Set(); // nodes that appear as a child at least once
  const parentSet = new Set();
  const adjacency = {}; // parent -> [children]
  const reverseAdj = {}; // child  -> [parents]

  for (const raw of dataArray) {
    const trimmed = typeof raw === "string" ? raw.trim() : String(raw).trim();
    const edge = parseEdge(trimmed);

    if (!edge) {
      invalidEntries.push(trimmed.length ? trimmed : raw);
      continue;
    }

    const { parent, child } = edge;
    const key = `${parent}->${child}`;

    // Duplicate check
    if (seenEdges.has(key)) {
      if (!duplicateEdges.includes(key)) duplicateEdges.push(key);
      continue;
    }
    seenEdges.add(key);

    // Multi-parent: if child already has a parent, silently discard this edge
    if (reverseAdj[child] && reverseAdj[child].length > 0) {
      continue;
    }

    // Register the edge
    if (!adjacency[parent]) adjacency[parent] = [];
    adjacency[parent].push(child);

    if (!reverseAdj[child]) reverseAdj[child] = [];
    reverseAdj[child].push(parent);

    childSet.add(child);
    parentSet.add(parent);
  }

  // All nodes ever mentioned
  const allNodes = new Set([
    ...Object.keys(adjacency),
    ...Object.keys(reverseAdj),
  ]);

  // Group nodes into connected components
  const visited = new Set();
  const components = [];

  // Start from nodes that are clearly roots (never a child), then sweep rest
  const potentialRoots = [...allNodes].filter((n) => !childSet.has(n)).sort();

  for (const root of potentialRoots) {
    if (visited.has(root)) continue;
    const group = collectGroup(root, adjacency, reverseAdj, visited);
    components.push(group);
  }

  // Catch any remaining nodes (e.g. pure cycles)
  for (const node of allNodes) {
    if (!visited.has(node)) {
      const group = collectGroup(node, adjacency, reverseAdj, visited);
      components.push(group);
    }
  }

  const hierarchies = [];
  let totalTrees = 0;
  let totalCycles = 0;
  let largestDepth = -1;
  let largestRoot = null;

  for (const group of components) {
    const nodes = [...group].sort();

    // Determine the root(s) of this component
    const groupRoots = nodes.filter((n) => !childSet.has(n));

    // There should normally be one root per component; if none, it's a pure cycle
    const root = groupRoots.length > 0 ? groupRoots.sort()[0] : nodes[0]; // lexicographically smallest for pure cycles

    // Cycle detection across the whole group
    const cycleVisited = new Set();
    const cycleStack = new Set();
    let foundCycle = false;

    for (const n of nodes) {
      if (!cycleVisited.has(n)) {
        if (hasCycle(n, adjacency, cycleVisited, cycleStack)) {
          foundCycle = true;
          break;
        }
      }
    }

    if (foundCycle) {
      totalCycles++;
      hierarchies.push({ root, tree: {}, has_cycle: true });
    } else {
      totalTrees++;
      const nested = {};
      nested[root] = buildNestedTree(root, adjacency);
      const depth = calcDepth(root, adjacency);

      hierarchies.push({ root, tree: nested, depth });

      // Track largest tree (tiebreak: lexicographically smaller root wins)
      if (
        depth > largestDepth ||
        (depth === largestDepth && root < largestRoot)
      ) {
        largestDepth = depth;
        largestRoot = root;
      }
    }
  }

  return {
    user_id: USER_ID,
    email_id: EMAIL_ID,
    college_roll_number: ROLL_NO,
    hierarchies,
    invalid_entries: invalidEntries,
    duplicate_edges: duplicateEdges,
    summary: {
      total_trees: totalTrees,
      total_cycles: totalCycles,
      largest_tree_root: largestRoot || "",
    },
  };
}

app.post("/bfhl", (req, res) => {
  const { data } = req.body;

  if (!Array.isArray(data)) {
    return res
      .status(400)
      .json({ error: "Request body must contain a 'data' array." });
  }

  const result = processData(data);
  res.json(result);
});

// Health check
app.get("/", (req, res) => res.send("BFHL API is running. POST to /bfhl"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
