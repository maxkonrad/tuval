import './style.css';

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
  el: HTMLElement;
}

// State
let componentCounter = 1;
const components = new Map<string, ComponentState>();
const wires = new Map<string, Wire>();
let drawingWire: { source: PortRef, startX: number, startY: number } | null = null;
let draggedComponent: { id: string, offsetX: number, offsetY: number } | null = null;

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

  // Node Dragging
  el.addEventListener('mousedown', e => {
    if ((e.target as HTMLElement).classList.contains('port')) return;
    draggedComponent = {
      id,
      offsetX: e.clientX - el.offsetLeft,
      offsetY: e.clientY - el.offsetTop
    };
  });

  componentLayer.appendChild(el);
  
  components.set(id, { id, type, value, x, y, el });
}

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
        connections
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
