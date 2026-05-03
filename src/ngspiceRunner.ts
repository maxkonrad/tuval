export interface SimulationResult {
  variables: string[];
  data: number[][];
}

export class NgspiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NgspiceError';
  }
}

/**
 * Executes a SPICE netlist string using ngspice.
 * (Currently mocks a backend/WASM call for development purposes)
 */
export async function runSimulation(spiceString: string): Promise<SimulationResult> {
  if (!spiceString.trim()) {
    throw new NgspiceError("Empty SPICE netlist provided.");
  }
  
  // Simulated backend call
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (spiceString.includes("ERROR") || spiceString.includes("invalid")) {
        reject(new NgspiceError("Simulation failed due to syntax error in netlist."));
      } else {
        // Return a mock parsed result
        resolve({
          variables: ["time", "V(node1)", "V(node2)"],
          data: [
            [0.0, 0.0, 5.0],
            [0.001, 1.0, 4.8],
            [0.002, 2.0, 4.5],
            [0.003, 3.0, 4.0],
          ]
        });
      }
    }, 500);
  });
}

/**
 * Parses raw column-based text output from ngspice into structured data.
 * Typical ngspice print output looks like:
 * Index   time            V(node1)
 * 0       0.000000e+00    0.000000e+00
 * 1       1.000000e-03    1.000000e-03
 */
export function parseNgspiceOutput(rawOutput: string): SimulationResult {
  const lines = rawOutput.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  // Check for fatal errors in output
  const errorLine = lines.find(l => l.toLowerCase().includes('error') || l.toLowerCase().includes('fatal'));
  if (errorLine) {
    throw new NgspiceError(`Engine reported an error: ${errorLine}`);
  }

  const variables: string[] = [];
  const data: number[][] = [];
  
  let parsingData = false;
  
  for (const line of lines) {
    // Detect header row
    if (line.toLowerCase().startsWith('index')) {
      const parts = line.split(/\s+/);
      variables.push(...parts.slice(1)); // Skip the 'Index' column
      parsingData = true;
      continue;
    }
    
    // Parse data rows
    if (parsingData) {
      const parts = line.split(/\s+/);
      // Ensure the row has the index plus data columns
      if (parts.length > 1 && !isNaN(Number(parts[0]))) {
        const rowData = parts.slice(1).map(Number);
        data.push(rowData);
      } else {
        // If we hit something that doesn't look like data, stop parsing
        parsingData = false;
      }
    }
  }
  
  return { variables, data };
}
