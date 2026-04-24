const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const AUTH_KEY = "armaanitsingh_20052005";
const CONTACT_POINT = "as7007@srmist.edu.in";
const STUDENT_ID = "RA2311030010264";

function verifyNodeFormat(rawInput) {
  const cleanInput = rawInput.trim();
  const nodeLinkSchema = /^([A-Z])->([A-Z])$/;
  const structureMatch = cleanInput.match(nodeLinkSchema);

  if (!structureMatch) return null;

  const [, origin, destination] = structureMatch;
  if (origin === destination) return null;

  return { origin, destination };
}

function generateNestedMap(activeNode, flowMap) {
  const sequence = flowMap[activeNode] || [];
  const branchMap = {};
  for (const step of sequence) {
    branchMap[step] = generateNestedMap(step, flowMap);
  }
  return branchMap;
}

function getHierarchyHeight(startPoint, flowMap) {
  const offspring = flowMap[startPoint];
  if (!offspring || offspring.length === 0) return 1;
  return 1 + Math.max(...offspring.map((o) => getHierarchyHeight(o, flowMap)));
}

function verifyCircularFlow(current, flowMap, tracker, stack) {
  tracker.add(current);
  stack.add(current);

  for (const link of flowMap[current] || []) {
    if (!tracker.has(link)) {
      if (verifyCircularFlow(link, flowMap, tracker, stack)) return true;
    } else if (stack.has(link)) {
      return true;
    }
  }

  stack.delete(current);
  return false;
}

function clusterNodes(seed, flowMap, backflowMap, tracker) {
  const cluster = new Set();
  const traversalQueue = [seed];

  while (traversalQueue.length) {
    const focus = traversalQueue.shift();
    if (cluster.has(focus)) continue;
    cluster.add(focus);

    for (const downstream of flowMap[focus] || []) {
      if (!cluster.has(downstream)) traversalQueue.push(downstream);
    }
    for (const upstream of backflowMap[focus] || []) {
      if (!cluster.has(upstream)) traversalQueue.push(upstream);
    }
  }

  tracker.add(...cluster);
  return cluster;
}

function runAnalysisEngine(payload) {
  const rejectedInputs = [];
  const recurringLinks = [];
  const uniqueLinks = new Set();
  const targetNodes = new Set();
  const sourceNodes = new Set();
  const forwardRegistry = {};
  const backwardRegistry = {};

  for (const item of payload) {
    const sanitized =
      typeof item === "string" ? item.trim() : String(item).trim();
    const linkObj = verifyNodeFormat(sanitized);

    if (!linkObj) {
      rejectedInputs.push(sanitized.length ? sanitized : item);
      continue;
    }

    const { origin, destination } = linkObj;
    const pathKey = `${origin}->${destination}`;

    if (uniqueLinks.has(pathKey)) {
      if (!recurringLinks.includes(pathKey)) recurringLinks.push(pathKey);
      continue;
    }
    uniqueLinks.add(pathKey);

    if (
      backwardRegistry[destination] &&
      backwardRegistry[destination].length > 0
    ) {
      continue;
    }

    if (!forwardRegistry[origin]) forwardRegistry[origin] = [];
    forwardRegistry[origin].push(destination);

    if (!backwardRegistry[destination]) backwardRegistry[destination] = [];
    backwardRegistry[destination].push(origin);

    targetNodes.add(destination);
    sourceNodes.add(origin);
  }

  const networkNodes = new Set([
    ...Object.keys(forwardRegistry),
    ...Object.keys(backwardRegistry),
  ]);

  const globalTracker = new Set();
  const networkSegments = [];
  const entryPoints = [...networkNodes]
    .filter((n) => !targetNodes.has(n))
    .sort();

  for (const entry of entryPoints) {
    if (globalTracker.has(entry)) continue;
    const segment = clusterNodes(
      entry,
      forwardRegistry,
      backwardRegistry,
      globalTracker,
    );
    networkSegments.push(segment);
  }

  for (const node of networkNodes) {
    if (!globalTracker.has(node)) {
      const segment = clusterNodes(
        node,
        forwardRegistry,
        backwardRegistry,
        globalTracker,
      );
      networkSegments.push(segment);
    }
  }

  const processedHierarchies = [];
  let linearTreeCount = 0;
  let loopCount = 0;
  let maxVerticality = -1;
  let primaryRootLabel = null;

  for (const segment of networkSegments) {
    const memberNodes = [...segment].sort();
    const segmentRoots = memberNodes.filter((n) => !targetNodes.has(n));
    const anchor =
      segmentRoots.length > 0 ? segmentRoots.sort()[0] : memberNodes[0];

    const loopTracker = new Set();
    const processStack = new Set();
    let loopDetected = false;

    for (const node of memberNodes) {
      if (!loopTracker.has(node)) {
        if (
          verifyCircularFlow(node, forwardRegistry, loopTracker, processStack)
        ) {
          loopDetected = true;
          break;
        }
      }
    }

    if (loopDetected) {
      loopCount++;
      processedHierarchies.push({ root: anchor, tree: {}, has_cycle: true });
    } else {
      linearTreeCount++;
      const schematic = {};
      schematic[anchor] = generateNestedMap(anchor, forwardRegistry);
      const verticalHeight = getHierarchyHeight(anchor, forwardRegistry);

      processedHierarchies.push({
        root: anchor,
        tree: schematic,
        depth: verticalHeight,
      });

      if (
        verticalHeight > maxVerticality ||
        (verticalHeight === maxVerticality && anchor < primaryRootLabel)
      ) {
        maxVerticality = verticalHeight;
        primaryRootLabel = anchor;
      }
    }
  }

  return {
    user_id: AUTH_KEY,
    email_id: CONTACT_POINT,
    college_roll_number: STUDENT_ID,
    hierarchies: processedHierarchies,
    invalid_entries: rejectedInputs,
    duplicate_edges: recurringLinks,
    summary: {
      total_trees: linearTreeCount,
      total_cycles: loopCount,
      largest_tree_root: primaryRootLabel || "",
    },
  };
}

app.post("/bfhl", (req, res) => {
  const { data: inboundData } = req.body;

  if (!Array.isArray(inboundData)) {
    return res.status(400).json({ error: "Invalid data format provided." });
  }

  const finalReport = runAnalysisEngine(inboundData);
  res.json(finalReport);
});

app.get("/", (req, res) => res.send("System Active. Endpoint: /bfhl"));

const PORT_VAL = process.env.PORT || 3000;
app.listen(PORT_VAL, () => console.log(`Active on ${PORT_VAL}`));
