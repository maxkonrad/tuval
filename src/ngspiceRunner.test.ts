import { describe, it, expect } from 'vitest';
import { parseNgspiceOutput, runSimulation } from './ngspiceRunner';

describe('ngspiceRunner', () => {
  it('should parse valid ngspice raw text output', () => {
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
  
  it('should run a real transient simulation via spicey', async () => {
    const netlist = [
      '* Simple RC Circuit',
      'v1 1 0 dc 5',
      'r1 1 2 1k',
      'c1 2 0 1u',
      '.tran 0.001 0.01',
      '.end'
    ].join('\n');
    
    const result = await runSimulation(netlist);
    
    expect(result.variables).toContain("time");
    expect(result.variables.length).toBeGreaterThanOrEqual(2);
    expect(result.data.length).toBeGreaterThan(0);
    
    // First time step should be 0
    expect(result.data[0][0]).toBe(0);
  });

  it('should throw NgspiceError for empty netlist', async () => {
    await expect(runSimulation('')).rejects.toThrow(/Empty SPICE netlist/);
  });
});
