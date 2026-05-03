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

// Icons — LTspice-style schematic symbols
const icons: Record<string, string> = {
  V: `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="16" y1="2" x2="16" y2="8"/><circle cx="16" cy="16" r="8"/><line x1="16" y1="24" x2="16" y2="30"/><line x1="14" y1="13" x2="18" y2="13"/><line x1="16" y1="11" x2="16" y2="15"/><line x1="14" y1="19" x2="18" y2="19"/></svg>`,
  R: `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="16" y1="2" x2="16" y2="8"/><rect x="10" y="8" width="12" height="16" rx="1"/><line x1="16" y1="24" x2="16" y2="30"/></svg>`,
  C: `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="16" y1="2" x2="16" y2="12"/><line x1="8" y1="12" x2="24" y2="12"/><line x1="8" y1="18" x2="24" y2="18"/><line x1="16" y1="18" x2="16" y2="30"/></svg>`,
  L: `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="16" y1="2" x2="16" y2="6"/><path d="M16 6 C20 6, 22 9, 22 11 C22 13, 20 14, 16 14" fill="none"/><path d="M16 14 C20 14, 22 17, 22 19 C22 21, 20 22, 16 22" fill="none"/><line x1="16" y1="22" x2="16" y2="30"/></svg>`,
  GND: `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="16" y1="4" x2="16" y2="14"/><line x1="6" y1="14" x2="26" y2="14"/><line x1="9" y1="19" x2="23" y2="19"/><line x1="12" y1="24" x2="20" y2="24"/></svg>`
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

let lastSimResult: SimulationResult | null = null;
let cursorX: number | null = null;

const plotCanvas = document.getElementById('plot-canvas') as HTMLCanvasElement;

plotCanvas.addEventListener('mousemove', (e) => {
  if (!lastSimResult) return;
  const rect = plotCanvas.getBoundingClientRect();
  cursorX = e.clientX - rect.left;
  renderCRTPlot(lastSimResult);
});

plotCanvas.addEventListener('mouseleave', () => {
  cursorX = null;
  if (lastSimResult) renderCRTPlot(lastSimResult);
});

function engFormat(val: number): string {
  const abs = Math.abs(val);
  if (abs === 0) return '0';
  if (abs >= 1e6)  return (val / 1e6).toFixed(2)  + 'M';
  if (abs >= 1e3)  return (val / 1e3).toFixed(2)  + 'k';
  if (abs >= 1)    return val.toFixed(3);
  if (abs >= 1e-3) return (val * 1e3).toFixed(2)  + 'm';
  if (abs >= 1e-6) return (val * 1e6).toFixed(2)  + 'µ';
  if (abs >= 1e-9) return (val * 1e9).toFixed(2)  + 'n';
  return val.toExponential(2);
}

interface SignalInfo {
  name: string;
  color: string;
  yMin: number;
  yMax: number;
  yRange: number;
  values: number[];
}

function renderCRTPlot(result: SimulationResult) {
  lastSimResult = result;
  const canvas = plotCanvas;
  const ctx = canvas.getContext('2d')!;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const W = rect.width;
  const H = rect.height;
  const PAD_L = 60;
  const PAD_R = 20;
  const PAD_T = 20;
  const PAD_B = 28;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  // Background
  ctx.fillStyle = '#001a00';
  ctx.fillRect(0, 0, W, H);

  if (result.data.length === 0) return;

  // Data ranges
  const xValues = result.data.map(row => row[0]);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const xRange = xMax - xMin || 1;

  const numSignals = result.variables.length - 1;
  const colors = ['#33ff33', '#ff3333', '#3399ff', '#ffcc00', '#ff66ff', '#66ffcc'];

  // Build signal info — use global Y range across all signals
  let globalYMin = Infinity;
  let globalYMax = -Infinity;
  const signals: SignalInfo[] = [];
  for (let sig = 0; sig < numSignals; sig++) {
    const values = result.data.map(row => row[sig + 1]);
    const yMin = Math.min(...values);
    const yMax = Math.max(...values);
    if (yMin < globalYMin) globalYMin = yMin;
    if (yMax > globalYMax) globalYMax = yMax;
    signals.push({
      name: result.variables[sig + 1] || `CH${sig + 1}`,
      color: colors[sig % colors.length],
      yMin, yMax, yRange: yMax - yMin || 1,
      values
    });
  }
  // Add 10% padding to global Y range
  const globalYRange = globalYMax - globalYMin || 1;
  const yPad = globalYRange * 0.1;
  const yAxisMin = globalYMin - yPad;
  const yAxisMax = globalYMax + yPad;
  const yAxisRange = yAxisMax - yAxisMin;

  // ── Grid ──
  const gridCols = 10;
  const gridRows = 8;

  ctx.strokeStyle = 'rgba(51, 255, 51, 0.1)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= gridCols; i++) {
    const x = PAD_L + (plotW / gridCols) * i;
    ctx.beginPath(); ctx.moveTo(x, PAD_T); ctx.lineTo(x, PAD_T + plotH); ctx.stroke();
  }
  for (let i = 0; i <= gridRows; i++) {
    const y = PAD_T + (plotH / gridRows) * i;
    ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(PAD_L + plotW, y); ctx.stroke();
  }

  // Center crosshair
  ctx.strokeStyle = 'rgba(51, 255, 51, 0.2)';
  ctx.beginPath();
  ctx.moveTo(PAD_L + plotW / 2, PAD_T); ctx.lineTo(PAD_L + plotW / 2, PAD_T + plotH);
  ctx.moveTo(PAD_L, PAD_T + plotH / 2); ctx.lineTo(PAD_L + plotW, PAD_T + plotH / 2);
  ctx.stroke();

  // ── Y Axis Labels ──
  ctx.fillStyle = 'rgba(51, 255, 51, 0.5)';
  ctx.font = '9px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  for (let i = 0; i <= gridRows; i++) {
    const y = PAD_T + (plotH / gridRows) * i;
    const val = yAxisMax - (yAxisRange / gridRows) * i;
    ctx.fillText(engFormat(val), PAD_L - 4, y + 3);
  }

  // ── X Axis Labels ──
  ctx.textAlign = 'center';
  const xTicks = 5;
  for (let i = 0; i <= xTicks; i++) {
    const val = xMin + (xRange / xTicks) * i;
    const x = PAD_L + (plotW / xTicks) * i;
    ctx.fillText(engFormat(val) + 's', x, H - 4);
  }

  // ── Draw Signals ──
  function xToPixel(xVal: number) { return PAD_L + ((xVal - xMin) / xRange) * plotW; }
  function yToPixel(yVal: number) { return PAD_T + plotH - ((yVal - yAxisMin) / yAxisRange) * plotH; }

  for (const sig of signals) {
    // Glow pass
    ctx.save();
    ctx.shadowColor = sig.color; ctx.shadowBlur = 10;
    ctx.strokeStyle = sig.color; ctx.globalAlpha = 0.25; ctx.lineWidth = 5;
    ctx.beginPath();
    result.data.forEach((row, i) => {
      const px = xToPixel(row[0]);
      const py = yToPixel(sig.values[i]);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });
    ctx.stroke(); ctx.restore();

    // Core trace
    ctx.save();
    ctx.shadowColor = sig.color; ctx.shadowBlur = 3;
    ctx.strokeStyle = sig.color; ctx.globalAlpha = 0.9; ctx.lineWidth = 1.5;
    ctx.beginPath();
    result.data.forEach((row, i) => {
      const px = xToPixel(row[0]);
      const py = yToPixel(sig.values[i]);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });
    ctx.stroke(); ctx.restore();
  }

  // ── Legend with min/max/Vpp ──
  ctx.font = '10px "JetBrains Mono", monospace';
  const legendX = PAD_L + plotW - 10;
  ctx.textAlign = 'right';
  signals.forEach((sig, idx) => {
    const ly = PAD_T + 14 + idx * 36;
    
    // Signal name
    ctx.fillStyle = sig.color;
    ctx.shadowColor = sig.color; ctx.shadowBlur = 4;
    ctx.fillText(sig.name, legendX, ly);
    ctx.shadowBlur = 0;

    // Stats
    ctx.fillStyle = 'rgba(51, 255, 51, 0.45)';
    ctx.font = '9px "JetBrains Mono", monospace';
    const vpp = sig.yMax - sig.yMin;
    ctx.fillText(`min:${engFormat(sig.yMin)}  max:${engFormat(sig.yMax)}  Vpp:${engFormat(vpp)}`, legendX, ly + 12);
    ctx.font = '10px "JetBrains Mono", monospace';
  });

  // ── Mouse Cursor Crosshair ──
  if (cursorX !== null && cursorX >= PAD_L && cursorX <= PAD_L + plotW) {
    // Vertical cursor line
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cursorX, PAD_T);
    ctx.lineTo(cursorX, PAD_T + plotH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Find nearest data point
    const cursorXRatio = (cursorX - PAD_L) / plotW;
    const cursorTime = xMin + cursorXRatio * xRange;
    let nearestIdx = 0;
    let minDist = Infinity;
    xValues.forEach((xv, i) => {
      const d = Math.abs(xv - cursorTime);
      if (d < minDist) { minDist = d; nearestIdx = i; }
    });

    // Time readout at top
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`t = ${engFormat(xValues[nearestIdx])}s`, cursorX, PAD_T - 4);

    // Value readouts per signal
    signals.forEach((sig, idx) => {
      const val = sig.values[nearestIdx];
      const py = yToPixel(val);

      // Dot on trace
      ctx.beginPath();
      ctx.arc(cursorX, py, 4, 0, Math.PI * 2);
      ctx.fillStyle = sig.color;
      ctx.shadowColor = sig.color; ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Value label
      const labelX = cursorX + (cursorX > PAD_L + plotW / 2 ? -10 : 10);
      ctx.textAlign = cursorX > PAD_L + plotW / 2 ? 'right' : 'left';
      ctx.fillStyle = '#000';
      const text = `${engFormat(val)}`;
      const metrics = ctx.measureText(text);
      ctx.fillRect(labelX - 2, py - 7 + idx * 16, metrics.width + 4, 14);
      ctx.fillStyle = sig.color;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText(text, labelX, py + 4 + idx * 16);
    });
  }
}

