import { describe, it, expect } from 'vitest';
import { transpileToSpice } from './transpiler';

describe('JSON-SPICE Transpiler', () => {
  it('should generate a basic SPICE netlist for an empty circuit', () => {
    const emptyCircuit = {
      title: "Test Circuit",
      components: []
    };
    
    const spiceOutput = transpileToSpice(emptyCircuit);
    
    expect(spiceOutput).toContain("* Test Circuit");
    expect(spiceOutput).toContain(".end");
  });

  it('should generate SPICE statements for basic components', () => {
    const simpleCircuit = {
      title: "Simple Circuit",
      components: [
        { id: "V1", type: "V", value: "5V", connections: ["node1", "0"] },
        { id: "R1", type: "R", value: "1k", connections: ["node1", "0"] }
      ]
    };
    
    const spiceOutput = transpileToSpice(simpleCircuit);
    const lines = spiceOutput.split('\n');
    
    expect(lines).toContain("V1 node1 0 5V");
    expect(lines).toContain("R1 node1 0 1k");
  });

  it('should throw an error for components with insufficient connections', () => {
    const invalidCircuit = {
      title: "Invalid Circuit",
      components: [
        { id: "R1", type: "R", value: "1k", connections: ["node1"] } // Only 1 connection
      ]
    };
    
    expect(() => transpileToSpice(invalidCircuit)).toThrowError("Component R1 has insufficient connections. Expected at least 2.");
  });

  it('should throw an error for dangling nodes (nodes with only 1 connection)', () => {
    const danglingCircuit = {
      title: "Dangling Circuit",
      components: [
        { id: "V1", type: "V", value: "5V", connections: ["node1", "0"] },
        { id: "R1", type: "R", value: "1k", connections: ["node1", "0"] },
        { id: "R2", type: "R", value: "2k", connections: ["node1", "node2"] } // node2 is dangling
      ]
    };
    
    expect(() => transpileToSpice(danglingCircuit)).toThrowError("Dangling node detected: node2");
  });

  it('should format spice_params as KEY=VALUE pairs in the output string', () => {
    const circuitWithParams = {
      title: "Params Circuit",
      components: [
        { 
          id: "M1", 
          value: "BSIM4", 
          connections: ["nd", "ng", "ns", "nb"],
          spice_params: {
            "W": "1u",
            "L": "0.5u"
          }
        },
        { id: "R1", value: "1k", connections: ["nd", "0"] },
        { id: "R2", value: "1k", connections: ["ng", "0"] },
        { id: "R3", value: "1k", connections: ["ns", "0"] },
        { id: "R4", value: "1k", connections: ["nb", "0"] }
      ]
    };
    
    const spiceOutput = transpileToSpice(circuitWithParams);
    expect(spiceOutput).toContain("M1 nd ng ns nb BSIM4 W=1u L=0.5u");
  });
});
