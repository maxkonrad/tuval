import { simulate } from 'spicey';

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
 * Runs a SPICE simulation using the spicey engine (pure JS).
 * Accepts a standard SPICE netlist string.
 */
export async function runSimulation(spiceString: string): Promise<SimulationResult> {
  if (!spiceString.trim()) {
    throw new NgspiceError("Empty SPICE netlist provided.");
  }

  try {
    const result = simulate(spiceString);

    // Prefer transient analysis, fall back to AC
    if (result.tran) {
      return formatTranResult(result.tran);
    }

    if (result.ac) {
      return formatAcResult(result.ac);
    }

    // No analysis directive found — return empty but valid result
    return { variables: [], data: [] };
  } catch (err: any) {
    throw new NgspiceError(`Simulation failed: ${err.message}`);
  }
}

function formatTranResult(tran: {
  times: number[];
  nodeVoltages: Record<string, number[]>;
  elementCurrents: Record<string, number[]>;
}): SimulationResult {
  const variables = ['time'];
  const signalArrays: number[][] = [];

  // Collect node voltages
  for (const [nodeName, values] of Object.entries(tran.nodeVoltages)) {
    variables.push(`V(${nodeName})`);
    signalArrays.push(values);
  }

  // Collect element currents
  for (const [elemName, values] of Object.entries(tran.elementCurrents)) {
    variables.push(`I(${elemName})`);
    signalArrays.push(values);
  }

  // Transpose into row-per-timestep format
  const data: number[][] = tran.times.map((t, i) => {
    const row = [t];
    for (const signal of signalArrays) {
      row.push(signal[i] ?? 0);
    }
    return row;
  });

  return { variables, data };
}

function formatAcResult(ac: {
  freqs: number[];
  nodeVoltages: Record<string, { abs(): number }[]>;
  elementCurrents: Record<string, { abs(): number }[]>;
}): SimulationResult {
  const variables = ['frequency'];
  const signalArrays: { abs(): number }[][] = [];

  for (const [nodeName, values] of Object.entries(ac.nodeVoltages)) {
    variables.push(`|V(${nodeName})|`);
    signalArrays.push(values);
  }

  for (const [elemName, values] of Object.entries(ac.elementCurrents)) {
    variables.push(`|I(${elemName})|`);
    signalArrays.push(values);
  }

  const data: number[][] = ac.freqs.map((f, i) => {
    const row = [f];
    for (const signal of signalArrays) {
      row.push(signal[i]?.abs() ?? 0);
    }
    return row;
  });

  return { variables, data };
}

/**
 * Parses raw column-based text output from ngspice into structured data.
 * Kept for backward compatibility with raw ngspice text output.
 */
export function parseNgspiceOutput(rawOutput: string): SimulationResult {
  const lines = rawOutput.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const errorLine = lines.find(l => l.toLowerCase().includes('error') || l.toLowerCase().includes('fatal'));
  if (errorLine) {
    throw new NgspiceError(`Engine reported an error: ${errorLine}`);
  }

  const variables: string[] = [];
  const data: number[][] = [];

  let parsingData = false;

  for (const line of lines) {
    if (line.toLowerCase().startsWith('index')) {
      const parts = line.split(/\s+/);
      variables.push(...parts.slice(1));
      parsingData = true;
      continue;
    }

    if (parsingData) {
      const parts = line.split(/\s+/);
      if (parts.length > 1 && !isNaN(Number(parts[0]))) {
        const rowData = parts.slice(1).map(Number);
        data.push(rowData);
      } else {
        parsingData = false;
      }
    }
  }

  return { variables, data };
}
