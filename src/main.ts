import './style.css';
import { transpileToSpice } from './transpiler';
import { runSimulation } from './ngspiceRunner';
import type { SimulationResult } from './ngspiceRunner';

interface PortRef {
  compId: string;
  portId: string;
}

interface Wire {
  id: string;
  source: PortRef;
  target: PortRef;
}

interface ComponentState {
  id: string;
  type: string;
  value: string;
  x: number;
  y: number;
  spice_params?: Record<string, string>;
  el: HTMLElement;
}

// State
let componentCounter = 1;
const components = new Map<string, ComponentState>();
const wires = new Map<string, Wire>();
let drawingWire: { source: PortRef, startX: number, startY: number } | null = null;
let draggedComponent: { id: string, offsetX: number, offsetY: number } | null = null;
let selectedComponentId: string | null = null;

// DOM Elements
const canvasContainer = document.getElementById('canvas-container')!;
const componentLayer = document.getElementById('component-layer')!;
const wireLayer = document.getElementById('wire-layer')!;
const paletteItems = document.querySelectorAll('.palette-item');

// Icons
const icons = {
  V: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/></svg>`,
  R: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12h4l2-4 4 8 4-8 4 8 2-4h2"/></svg>`,
  GND: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4v8M6 12h12M8 16h8M10 20h4"/></svg>`
};

// Drag from Palette
paletteItems.forEach(item => {
  item.addEventListener('dragstart', (e: Event) => {
    const dragEvent = e as DragEvent;
    const target = dragEvent.target as HTMLElement;
    dragEvent.dataTransfer!.setData('type', target.dataset.type!);
    dragEvent.dataTransfer!.setData('value', target.dataset.value!);
    dragEvent.dataTransfer!.effectAllowed = 'copy';
  });
});

canvasContainer.addEventListener('dragover', e => {
  e.preventDefault();
  e.dataTransfer!.dropEffect = 'copy';
});

canvasContainer.addEventListener('drop', e => {
  e.preventDefault();
  const type = e.dataTransfer!.getData('type');
  const value = e.dataTransfer!.getData('value');
  
  if (type) {
    const rect = componentLayer.getBoundingClientRect();
    const x = e.clientX - rect.left - 40;
    const y = e.clientY - rect.top - 40;
    
    createComponent(type, value, x, y);
  }
});

function createComponent(type: string, value: string, x: number, y: number, forceId?: string) {
  const id = forceId || `${type}${componentCounter++}`;
  
  const el = document.createElement('div');
  el.className = 'circuit-node';
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  
  el.innerHTML = `
    <div class="icon">${icons[type as keyof typeof icons] || ''}</div>
    <div class="id-label">${id}</div>
    ${type !== 'GND' ? `<input type="text" class="val-input" value="${value}">` : ''}
  `;
  
  // Create ports based on type
  if (type === 'GND') {
    createPort(el, id, '0', 'port-top');
  } else {
    createPort(el, id, 'p1', 'port-left');
    createPort(el, id, 'p2', 'port-right');
  }

  // Value update listener
  const input = el.querySelector('.val-input') as HTMLInputElement;
  if (input) {
    input.addEventListener('change', (e) => {
      const comp = components.get(id);
      if (comp) comp.value = (e.target as HTMLInputElement).value;
    });
    input.addEventListener('mousedown', e => e.stopPropagation());
  }

  // Node Dragging and Selection
  el.addEventListener('mousedown', e => {
    if ((e.target as HTMLElement).classList.contains('port')) return;
    
    // Select component
    selectComponent(id);

    draggedComponent = {
      id,
      offsetX: e.clientX - el.offsetLeft,
      offsetY: e.clientY - el.offsetTop
    };
  });

  componentLayer.appendChild(el);
  
  components.set(id, { id, type, value, x, y, spice_params: {}, el });
}

function selectComponent(id: string) {
  selectedComponentId = id;
  const comp = components.get(id);
  
  document.querySelectorAll('.circuit-node').forEach(n => {
    (n as HTMLElement).style.borderColor = 'var(--border-color)';
  });
  
  if (comp) {
    comp.el.style.borderColor = 'var(--accent-color)';
    renderPropertiesPanel(comp);
  }
}

function renderPropertiesPanel(comp: ComponentState) {
  const panel = document.getElementById('properties-panel')!;
  panel.style.display = 'block';
  document.getElementById('prop-target-id')!.innerText = `Editing: ${comp.id}`;
  
  const list = document.getElementById('prop-params-list')!;
  list.innerHTML = '';
  
  if (comp.spice_params) {
    Object.entries(comp.spice_params).forEach(([key, val]) => {
      const item = document.createElement('div');
      item.className = 'param-item';
      item.innerHTML = `
        <span>${key}=${val}</span>
        <button class="btn-remove" data-key="${key}">×</button>
      `;
      item.querySelector('.btn-remove')?.addEventListener('click', () => {
        delete comp.spice_params![key];
        renderPropertiesPanel(comp);
      });
      list.appendChild(item);
    });
  }
}

document.getElementById('btn-add-param')?.addEventListener('click', () => {
  if (!selectedComponentId) return;
  const comp = components.get(selectedComponentId);
  if (!comp) return;
  
  const keyInput = document.getElementById('new-param-key') as HTMLInputElement;
  const valInput = document.getElementById('new-param-val') as HTMLInputElement;
  
  if (keyInput.value && valInput.value) {
    if (!comp.spice_params) comp.spice_params = {};
    comp.spice_params[keyInput.value] = valInput.value;
    keyInput.value = '';
    valInput.value = '';
    renderPropertiesPanel(comp);
  }
});

function createPort(parent: HTMLElement, compId: string, portId: string, positionClass: string) {
  const port = document.createElement('div');
  port.className = `port ${positionClass}`;
  port.dataset.compId = compId;
  port.dataset.portId = portId;
  
  port.addEventListener('mousedown', e => {
    e.stopPropagation();
    const rect = port.getBoundingClientRect();
    const layerRect = componentLayer.getBoundingClientRect();
    drawingWire = {
      source: { compId, portId },
      startX: rect.left + rect.width / 2 - layerRect.left,
      startY: rect.top + rect.height / 2 - layerRect.top
    };
  });
  
  port.addEventListener('mouseup', e => {
    e.stopPropagation();
    if (drawingWire && (drawingWire.source.compId !== compId || drawingWire.source.portId !== portId)) {
      addWire(drawingWire.source, { compId, portId });
    }
    drawingWire = null;
    renderWires();
  });
  
  parent.appendChild(port);
}

// Global Mouse Events for Canvas
document.addEventListener('mousemove', e => {
  const layerRect = componentLayer.getBoundingClientRect();
  
  if (draggedComponent) {
    const comp = components.get(draggedComponent.id);
    if (comp) {
      comp.x = e.clientX - draggedComponent.offsetX;
      comp.y = e.clientY - draggedComponent.offsetY;
      comp.el.style.left = `${comp.x}px`;
      comp.el.style.top = `${comp.y}px`;
      renderWires();
    }
  } else if (drawingWire) {
    renderWires(e.clientX - layerRect.left, e.clientY - layerRect.top);
  }
});

document.addEventListener('mouseup', () => {
  draggedComponent = null;
  if (drawingWire) {
    drawingWire = null;
    renderWires();
  }
});

// Wiring
function addWire(source: PortRef, target: PortRef) {
  const wireId = `w_${Date.now()}`;
  wires.set(wireId, { id: wireId, source, target });
}

function getPortCoordinates(compId: string, portId: string) {
  const comp = components.get(compId);
  if (!comp) return { x: 0, y: 0 };
  
  const portEl = comp.el.querySelector(`[data-port-id="${portId}"]`) as HTMLElement;
  if (!portEl) return { x: comp.x, y: comp.y };
  
  const rect = portEl.getBoundingClientRect();
  const layerRect = componentLayer.getBoundingClientRect();
  
  return {
    x: rect.left + rect.width / 2 - layerRect.left,
    y: rect.top + rect.height / 2 - layerRect.top
  };
}

function renderWires(mouseX?: number, mouseY?: number) {
  let svgContent = '';
  
  wires.forEach(wire => {
    const start = getPortCoordinates(wire.source.compId, wire.source.portId);
    const end = getPortCoordinates(wire.target.compId, wire.target.portId);
    svgContent += `<path d="M ${start.x} ${start.y} C ${start.x + 50} ${start.y}, ${end.x - 50} ${end.y}, ${end.x} ${end.y}" />`;
  });
  
  if (drawingWire && mouseX !== undefined && mouseY !== undefined) {
    const start = drawingWire;
    svgContent += `<path class="drawing" d="M ${start.startX} ${start.startY} C ${start.startX + 50} ${start.startY}, ${mouseX - 50} ${mouseY}, ${mouseX} ${mouseY}" />`;
  }
  
  wireLayer.innerHTML = svgContent;
}

// Export / Import Logic
document.getElementById('btn-export')?.addEventListener('click', exportJSON);
document.getElementById('btn-import')?.addEventListener('click', () => {
  document.getElementById('file-input')?.click();
});

document.getElementById('file-input')?.addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        importJSON(json);
      } catch (err) {
        alert("Invalid JSON file");
      }
    };
    reader.readAsText(file);
  }
});

function exportJSON() {
  // Graph traversal to find connected node IDs
  const graph = new Map<string, Set<string>>(); // portKey -> Set of connected portKeys
  
  components.forEach(c => {
    // initialize isolated ports
    const ports = c.type === 'GND' ? ['0'] : ['p1', 'p2'];
    ports.forEach(p => {
      graph.set(`${c.id}:${p}`, new Set());
    });
  });
  
  wires.forEach(w => {
    const src = `${w.source.compId}:${w.source.portId}`;
    const tgt = `${w.target.compId}:${w.target.portId}`;
    if (!graph.has(src)) graph.set(src, new Set());
    if (!graph.has(tgt)) graph.set(tgt, new Set());
    graph.get(src)!.add(tgt);
    graph.get(tgt)!.add(src);
  });
  
  // Find connected components
  let nodeCounter = 1;
  const portToNodeId = new Map<string, string>();
  const visited = new Set<string>();
  
  graph.forEach((_, startPort) => {
    if (visited.has(startPort)) return;
    
    // BFS
    const componentPorts = [];
    const queue = [startPort];
    visited.add(startPort);
    
    let isGND = false;
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      componentPorts.push(current);
      if (current.endsWith(':0')) isGND = true;
      
      const nbs = graph.get(current);
      if (nbs) {
        nbs.forEach(n => {
          if (!visited.has(n)) {
            visited.add(n);
            queue.push(n);
          }
        });
      }
    }
    
    const assignedNodeId = isGND ? '0' : `node${nodeCounter++}`;
    componentPorts.forEach(p => portToNodeId.set(p, assignedNodeId));
  });
  
  const exportData = {
    title: "Web Exported Circuit",
    components: Array.from(components.values()).map(c => {
      let connections = [];
      if (c.type === 'GND') {
        connections = [portToNodeId.get(`${c.id}:0`) || '0'];
      } else {
        connections = [
          portToNodeId.get(`${c.id}:p1`) || `unconn_${c.id}_p1`,
          portToNodeId.get(`${c.id}:p2`) || `unconn_${c.id}_p2`
        ];
      }
      
      return {
        id: c.id,
        type: c.type,
        value: c.value,
        x: c.x,
        y: c.y,
        connections,
        spice_params: c.spice_params
      };
    }),
    wires: Array.from(wires.values()) // Save wires for visual reconstruction
  };
  
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'circuit.json';
  a.click();
}

function importJSON(data: any) {
  componentLayer.innerHTML = '';
  wireLayer.innerHTML = '';
  components.clear();
  wires.clear();
  
  let maxIdNum = 0;
  
  if (data.components) {
    data.components.forEach((c: any) => {
      createComponent(c.type, c.value || '', c.x, c.y, c.id);
      
      const comp = components.get(c.id);
      if (comp && c.spice_params) {
        comp.spice_params = c.spice_params;
      }
      
      const match = c.id.match(/\d+/);
      if (match) {
        maxIdNum = Math.max(maxIdNum, parseInt(match[0], 10));
      }
    });
  }
  
  if (data.wires) {
    data.wires.forEach((w: any) => {
      wires.set(w.id, w);
    });
  }
  
  componentCounter = maxIdNum + 1;
  setTimeout(() => renderWires(), 50); // wait for dom flush
}

// ── E2E Simulation Pipeline ──

function buildCircuitJSON() {
  // Reuse the export logic to produce a transpiler-ready JSON
  const graph = new Map<string, Set<string>>();
  
  components.forEach(c => {
    const ports = c.type === 'GND' ? ['0'] : ['p1', 'p2'];
    ports.forEach(p => {
      graph.set(`${c.id}:${p}`, new Set());
    });
  });
  
  wires.forEach(w => {
    const src = `${w.source.compId}:${w.source.portId}`;
    const tgt = `${w.target.compId}:${w.target.portId}`;
    if (!graph.has(src)) graph.set(src, new Set());
    if (!graph.has(tgt)) graph.set(tgt, new Set());
    graph.get(src)!.add(tgt);
    graph.get(tgt)!.add(src);
  });
  
  let nodeCounter = 1;
  const portToNodeId = new Map<string, string>();
  const visited = new Set<string>();
  
  graph.forEach((_, startPort) => {
    if (visited.has(startPort)) return;
    const componentPorts: string[] = [];
    const queue = [startPort];
    visited.add(startPort);
    let isGND = false;
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      componentPorts.push(current);
      if (current.endsWith(':0')) isGND = true;
      const nbs = graph.get(current);
      if (nbs) {
        nbs.forEach(n => {
          if (!visited.has(n)) {
            visited.add(n);
            queue.push(n);
          }
        });
      }
    }
    
    const assignedNodeId = isGND ? '0' : `node${nodeCounter++}`;
    componentPorts.forEach(p => portToNodeId.set(p, assignedNodeId));
  });
  
  return {
    title: "Live Simulation",
    components: Array.from(components.values())
      .filter(c => c.type !== 'GND')
      .map(c => {
        const connections = [
          portToNodeId.get(`${c.id}:p1`) || `unconn_${c.id}_p1`,
          portToNodeId.get(`${c.id}:p2`) || `unconn_${c.id}_p2`
        ];
        return {
          id: c.id,
          type: c.type,
          value: c.value,
          connections,
          spice_params: c.spice_params
        };
      })
  };
}

// Simulate button
document.getElementById('btn-simulate')?.addEventListener('click', async () => {
  const resultsPanel = document.getElementById('results-panel')!;
  const status = document.getElementById('results-status')!;
  const netlistPreview = document.getElementById('netlist-preview')!;
  const btn = document.getElementById('btn-simulate') as HTMLButtonElement;
  
  resultsPanel.classList.add('open');
  status.className = 'results-status';
  status.textContent = '▶ Transpiling circuit...';
  btn.disabled = true;
  
  try {
    if (components.size === 0) {
      throw new Error('No components on canvas. Drag some from the sidebar first.');
    }
    
    const circuitJSON = buildCircuitJSON();
    const spiceNetlist = transpileToSpice(circuitJSON);
    
    netlistPreview.textContent = spiceNetlist;
    netlistPreview.classList.add('visible');
    status.textContent = '▶ Running ngspice simulation...';
    
    const result = await runSimulation(spiceNetlist);
    
    status.className = 'results-status success';
    status.textContent = `✓ Simulation complete — ${result.variables.length} signals, ${result.data.length} data points`;
    
    renderCRTPlot(result);
  } catch (err: any) {
    status.className = 'results-status error';
    status.textContent = `✗ ${err.message}`;
  } finally {
    btn.disabled = false;
  }
});

// Close results panel
document.getElementById('btn-close-results')?.addEventListener('click', () => {
  document.getElementById('results-panel')!.classList.remove('open');
});

// ── CRT Oscilloscope Renderer ──

function renderCRTPlot(result: SimulationResult) {
  const canvas = document.getElementById('plot-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  
  // High-DPI support
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  
  const W = rect.width;
  const H = rect.height;
  const PAD = 30;
  const plotW = W - PAD * 2;
  const plotH = H - PAD * 2;
  
  // Black background
  ctx.fillStyle = '#001a00';
  ctx.fillRect(0, 0, W, H);
  
  // Grid lines (dim green, like a real CRT graticule)
  ctx.strokeStyle = 'rgba(51, 255, 51, 0.12)';
  ctx.lineWidth = 1;
  
  const gridCols = 10;
  const gridRows = 8;
  
  for (let i = 0; i <= gridCols; i++) {
    const x = PAD + (plotW / gridCols) * i;
    ctx.beginPath();
    ctx.moveTo(x, PAD);
    ctx.lineTo(x, PAD + plotH);
    ctx.stroke();
  }
  
  for (let i = 0; i <= gridRows; i++) {
    const y = PAD + (plotH / gridRows) * i;
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(PAD + plotW, y);
    ctx.stroke();
  }
  
  // Center crosshair (brighter)
  ctx.strokeStyle = 'rgba(51, 255, 51, 0.25)';
  ctx.beginPath();
  ctx.moveTo(PAD + plotW / 2, PAD);
  ctx.lineTo(PAD + plotW / 2, PAD + plotH);
  ctx.moveTo(PAD, PAD + plotH / 2);
  ctx.lineTo(PAD + plotW, PAD + plotH / 2);
  ctx.stroke();
  
  // Plot each signal (skip first variable which is usually time/frequency)
  if (result.data.length === 0) return;
  
  const numSignals = result.variables.length - 1; // skip X axis
  const colors = [
    '#33ff33', // classic phosphor green
    '#66ff66',
    '#99ff99',
  ];
  
  // Find data ranges
  const xValues = result.data.map(row => row[0]);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const xRange = xMax - xMin || 1;
  
  for (let sig = 0; sig < numSignals; sig++) {
    const yValues = result.data.map(row => row[sig + 1]);
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);
    const yRange = yMax - yMin || 1;
    
    const color = colors[sig % colors.length];
    
    // Phosphor glow (wide, blurry pass)
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 6;
    ctx.beginPath();
    
    result.data.forEach((row, i) => {
      const x = PAD + ((row[0] - xMin) / xRange) * plotW;
      const y = PAD + plotH - ((row[sig + 1] - yMin) / yRange) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
    
    // Core trace (sharp, bright)
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    result.data.forEach((row, i) => {
      const x = PAD + ((row[0] - xMin) / xRange) * plotW;
      const y = PAD + plotH - ((row[sig + 1] - yMin) / yRange) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
    
    // Bright center line (hotspot)
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = 0.15;
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    result.data.forEach((row, i) => {
      const x = PAD + ((row[0] - xMin) / xRange) * plotW;
      const y = PAD + plotH - ((row[sig + 1] - yMin) / yRange) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  }
  
  // Axis labels (dim green)
  ctx.fillStyle = 'rgba(51, 255, 51, 0.6)';
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  
  // X axis labels
  for (let i = 0; i <= 4; i++) {
    const val = xMin + (xRange / 4) * i;
    const x = PAD + (plotW / 4) * i;
    ctx.fillText(val.toExponential(1), x, H - 6);
  }
  
  // Y axis label
  ctx.textAlign = 'right';
  ctx.fillText(result.variables[0] || 'x', PAD + plotW, H - 6);
  
  // Signal legend
  ctx.textAlign = 'left';
  for (let sig = 0; sig < numSignals; sig++) {
    const color = colors[sig % colors.length];
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;
    ctx.fillText(result.variables[sig + 1] || `ch${sig + 1}`, PAD + 4, PAD - 6 - sig * 14);
    ctx.shadowBlur = 0;
  }
}
