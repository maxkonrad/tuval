import { describe, it, expect } from 'vitest';
import { parseNgspiceOutput, runSimulation } from './ngspiceRunner';

describe('ngspiceRunner', () => {
  it('should parse valid ngspice output', () => {
    const rawOutput = `
      No. of Data Rows : 3
      Index   time            V(node1)
      0       0.000000e+00    0.000000e+00
      1       1.000000e-03    5.000000e+00
      2       2.000000e-03    4.900000e+00
    `;
    
    const result = parseNgspiceOutput(rawOutput);
    
    expect(result.variables).toEqual(["time", "V(node1)"]);
    expect(result.data.length).toBe(3);
    expect(result.data[0]).toEqual([0, 0]);
    expect(result.data[1]).toEqual([0.001, 5]);
    expect(result.data[2]).toEqual([0.002, 4.9]);
  });

  it('should throw an error if the output contains "error"', () => {
    const rawOutput = `
      Error on line 5:
      V1 node1 0 5V
      Fatal error: unknown device
    `;
    
    expect(() => parseNgspiceOutput(rawOutput)).toThrowError(/Engine reported an error/);
  });
  
  it('should simulate a successful run using the mock API', async () => {
    const validNetlist = `
      * Test Circuit
      V1 node1 0 5V
      R1 node1 0 1k
      .end
    `;
    
    const result = await runSimulation(validNetlist);
    expect(result.variables).toContain("time");
    expect(result.data.length).toBeGreaterThan(0);
  });
  
  it('should simulate a failure when the netlist contains syntax errors', async () => {
    const invalidNetlist = `
      * Test Circuit
      ERROR: bad syntax
      .end
    `;
    
    await expect(runSimulation(invalidNetlist)).rejects.toThrow(/Simulation failed due to syntax error/);
  });
});
