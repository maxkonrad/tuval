export interface Circuit {
  title?: string;
  components: any[];
}

export function transpileToSpice(circuit: Circuit): string {
  const lines: string[] = [];
  
  const title = circuit.title || "Untitled Circuit";
  lines.push(`* ${title}`);
  
  const nodeCounts: Record<string, number> = {};

  for (const comp of circuit.components) {
    const { id, value, connections, spice_params } = comp;
    
    if (!connections || connections.length < 2) {
      throw new Error(`Component ${id} has insufficient connections. Expected at least 2.`);
    }

    connections.forEach((node: string) => {
      nodeCounts[node] = (nodeCounts[node] || 0) + 1;
    });

    const connStr = connections.join(" ");
    let compStr = `${id} ${connStr} ${value || ""}`.trim();

    if (spice_params) {
      const paramsStr = Object.entries(spice_params)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ");
      compStr += ` ${paramsStr}`;
    }

    lines.push(compStr);
  }

  for (const [node, count] of Object.entries(nodeCounts)) {
    if (count === 1) {
      throw new Error(`Dangling node detected: ${node}`);
    }
  }
  
  lines.push(".end");
  
  return lines.join("\n");
}
