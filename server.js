const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const AUTH_TOKEN = "armaanitsingh_20052005";
const CONTACT_EMAIL = "as7007@srmist.edu.in";
const STUDENT_REF = "RA2311030010264";

app.get("/", (req, res) => {
  res
    .status(200)
    .send("System status: ONLINE. Analysis engine ready at /bfhl.");
});

app.get("/status", (req, res) => res.send("Active"));

function validateLink(input) {
  const sanitized = input.trim();
  const format = /^([A-Z])->([A-Z])$/;
  const check = sanitized.match(format);

  if (!check) return null;

  const [, head, tail] = check;
  if (head === tail) return null;

  return { head, tail };
}

function mapBranches(origin, registry) {
  const leafNodes = registry[origin] || [];
  const struct = {};
  for (const leaf of leafNodes) {
    struct[leaf] = mapBranches(leaf, registry);
  }
  return struct;
}

function findMaxDepth(node, registry) {
  const targets = registry[node];
  if (!targets || targets.length === 0) return 1;
  return 1 + Math.max(...targets.map((t) => findMaxDepth(t, registry)));
}

function verifyFlow(node, registry, history, stack) {
  history.add(node);
  stack.add(node);

  for (const nextNode of registry[node] || []) {
    if (!history.has(nextNode)) {
      if (verifyFlow(nextNode, registry, history, stack)) return true;
    } else if (stack.has(nextNode)) {
      return true;
    }
  }

  stack.delete(node);
  return false;
}

function analyzeDataset(buffer) {
  const invalidItems = [];
  const repeatedEdges = [];
  const uniqueKeys = new Set();
  const childRegistry = new Set();
  const parentLog = {};
  const networkAdjacency = {};
  const masterNodes = new Set();

  buffer.forEach((item) => {
    const raw = typeof item === "string" ? item.trim() : String(item).trim();
    const edgeObj = validateLink(raw);

    if (!edgeObj) {
      invalidItems.push(item);
      return;
    }

    const { head, tail } = edgeObj;
    const pathKey = `${head}->${tail}`;

    if (uniqueKeys.has(pathKey)) {
      if (!repeatedEdges.includes(pathKey)) repeatedEdges.push(pathKey);
      return;
    }
    uniqueKeys.add(pathKey);

    if (parentLog[tail] && parentLog[tail] !== head) return;
    parentLog[tail] = head;

    if (!networkAdjacency[head]) networkAdjacency[head] = [];
    networkAdjacency[head].push(tail);

    masterNodes.add(head);
    masterNodes.add(tail);
    childRegistry.add(tail);
  });

  if (masterNodes.size === 0) {
    return {
      user_id: AUTH_TOKEN,
      email_id: CONTACT_EMAIL,
      college_roll_number: STUDENT_REF,
      hierarchies: [],
      invalid_entries: invalidItems,
      duplicate_edges: repeatedEdges,
      summary: { total_trees: 0, total_cycles: 0, largest_tree_root: null },
    };
  }

  const roots = [...masterNodes].filter((n) => !childRegistry.has(n)).sort();
  const treesToMap = roots.length > 0 ? roots : [[...masterNodes].sort()[0]];

  const hierarchies = [];
  let treeCount = 0;
  let cycleCount = 0;
  let peakDepth = 0;
  let dominantRoot = "";

  treesToMap.forEach((entryPoint) => {
    const cycleStack = new Set();
    const cycleHistory = new Set();
    const isCyclic = verifyFlow(
      entryPoint,
      networkAdjacency,
      cycleHistory,
      cycleStack,
    );

    const resultNode = { root: entryPoint };

    if (isCyclic) {
      resultNode.has_cycle = true;
      resultNode.tree = {};
      cycleCount++;
    } else {
      resultNode.tree = {
        [entryPoint]: mapBranches(entryPoint, networkAdjacency),
      };
      const depthVal = findMaxDepth(entryPoint, networkAdjacency);
      resultNode.depth = depthVal;
      treeCount++;

      if (depthVal > peakDepth) {
        peakDepth = depthVal;
        dominantRoot = entryPoint;
      } else if (depthVal === peakDepth && peakDepth > 0) {
        if (entryPoint < dominantRoot) dominantRoot = entryPoint;
      }
    }
    hierarchies.push(resultNode);
  });

  return {
    user_id: AUTH_TOKEN,
    email_id: CONTACT_EMAIL,
    college_roll_number: STUDENT_REF,
    hierarchies,
    invalid_entries: invalidItems,
    duplicate_edges: repeatedEdges,
    summary: {
      total_trees: treeCount,
      total_cycles: cycleCount,
      largest_tree_root: dominantRoot || null,
    },
  };
}

app.post("/bfhl", (req, res) => {
  const incomingData = req.body.data || [];
  if (!Array.isArray(incomingData))
    return res.status(400).json({ error: "Data array required" });
  res.json(analyzeDataset(incomingData));
});

const APP_LISTEN_PORT = process.env.PORT || 3000;
app.listen(APP_LISTEN_PORT, () =>
  console.log(`Gateway active on ${APP_LISTEN_PORT}`),
);
