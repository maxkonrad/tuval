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
  V: `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="16" y1="2" x2="16" y2="8"/><circle cx="16" cy="16" r="8"/><line x1="16" y1="24" x2="16" y2="30"/><line x1="12" y1="24" x2="20" y2="24"/><line x1="12" y1="
