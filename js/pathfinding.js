class Node {
  constructor(col, row) {
    this.col = col;
    this.row = row;
  }
  key() {
    return `${this.col},${this.row}`;
  }
}

function heuristic(a, b) {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

function getWalkableNeighbors(node, grid) {
  const rows = grid.length;
  const cols = grid[0].length;
  const directions = [
    { dc: 0, dr: -1 },
    { dc: 0, dr: 1 },
    { dc: -1, dr: 0 },
    { dc: 1, dr: 0 },
  ];
  const neighbors = [];
  for (const dir of directions) {
    const newCol = node.col + dir.dc;
    const newRow = node.row + dir.dr;
    if (newCol < 0 || newCol >= cols || newRow < 0 || newRow >= rows) continue;
    if (grid[newRow][newCol] === 1) continue;
    neighbors.push(new Node(newCol, newRow));
  }
  return neighbors;
}

function reconstructPath(cameFrom, current) {
  const path = [current];
  let currentKey = current.key();
  while (cameFrom.has(currentKey)) {
    current = cameFrom.get(currentKey);
    currentKey = current.key();
    path.unshift(current);
  }
  return path;
}

export function findPathAStar(grid, start, goal) {
  const startNode = new Node(start.col, start.row);
  const goalNode = new Node(goal.col, goal.row);

  if (grid[goalNode.row]?.[goalNode.col] === 1) return null;

  const openSet = [startNode];
  const openSetKeys = new Set([startNode.key()]);
  const closedSet = new Set();
  const cameFrom = new Map();
  const gScore = new Map();
  gScore.set(startNode.key(), 0);
  const fScore = new Map();
  fScore.set(startNode.key(), heuristic(startNode, goalNode));

  const MAX_ITERATIONS = 2000;
  let iterations = 0;

  while (openSet.length > 0 && iterations < MAX_ITERATIONS) {
    iterations++;

    let currentIndex = 0;
    let lowestF = fScore.get(openSet[0].key()) ?? Infinity;
    for (let i = 1; i < openSet.length; i++) {
      const f = fScore.get(openSet[i].key()) ?? Infinity;
      if (f < lowestF) { lowestF = f; currentIndex = i; }
    }

    const current = openSet[currentIndex];
    const currentKey = current.key();

    if (current.col === goalNode.col && current.row === goalNode.row) {
      return reconstructPath(cameFrom, current).map((n) => ({ col: n.col, row: n.row }));
    }

    openSet.splice(currentIndex, 1);
    openSetKeys.delete(currentKey);
    closedSet.add(currentKey);

    const neighbors = getWalkableNeighbors(current, grid);

    for (const neighbor of neighbors) {
      const neighborKey = neighbor.key();
      if (closedSet.has(neighborKey)) continue;

      const tentativeGScore = (gScore.get(currentKey) ?? Infinity) + 1;

      if (!openSetKeys.has(neighborKey)) {
        openSet.push(neighbor);
        openSetKeys.add(neighborKey);
      } else if (tentativeGScore >= (gScore.get(neighborKey) ?? Infinity)) {
        continue;
      }

      cameFrom.set(neighborKey, current);
      gScore.set(neighborKey, tentativeGScore);
      fScore.set(neighborKey, tentativeGScore + heuristic(neighbor, goalNode));
    }
  }

  return null;
}

export function simplifyPath(path) {
  if (!path || path.length <= 2) return path;
  const simplified = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    const next = path[i + 1];
    const dir1 = { dc: curr.col - prev.col, dr: curr.row - prev.row };
    const dir2 = { dc: next.col - curr.col, dr: next.row - curr.row };
    if (dir1.dc !== dir2.dc || dir1.dr !== dir2.dr) simplified.push(curr);
  }
  simplified.push(path[path.length - 1]);
  return simplified;
}
