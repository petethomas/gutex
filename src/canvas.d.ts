// Type declaration for optional canvas package
declare module 'canvas' {
  export function createCanvas(width: number, height: number): {
    getContext(type: '2d'): CanvasRenderingContext2D;
    width: number;
    height: number;
    toBuffer(type?: string): Buffer;
  };
  
  export interface CanvasRenderingContext2D {
    fillStyle: string | CanvasGradient | CanvasPattern;
    strokeStyle: string | CanvasGradient | CanvasPattern;
    lineWidth: number;
    font: string;
    textAlign: CanvasTextAlign;
    textBaseline: CanvasTextBaseline;
    globalAlpha: number;
    globalCompositeOperation: GlobalCompositeOperation;
    shadowColor: string;
    shadowBlur: number;
    shadowOffsetX: number;
    shadowOffsetY: number;
    lineCap: CanvasLineCap;
    lineJoin: CanvasLineJoin;
    miterLimit: number;
    
    fillRect(x: number, y: number, w: number, h: number): void;
    strokeRect(x: number, y: number, w: number, h: number): void;
    clearRect(x: number, y: number, w: number, h: number): void;
    fillText(text: string, x: number, y: number, maxWidth?: number): void;
    strokeText(text: string, x: number, y: number, maxWidth?: number): void;
    measureText(text: string): TextMetrics;
    beginPath(): void;
    closePath(): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void;
    arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
    bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void;
    rect(x: number, y: number, w: number, h: number): void;
    fill(fillRule?: CanvasFillRule): void;
    stroke(): void;
    clip(fillRule?: CanvasFillRule): void;
    save(): void;
    restore(): void;
    translate(x: number, y: number): void;
    rotate(angle: number): void;
    scale(x: number, y: number): void;
    transform(a: number, b: number, c: number, d: number, e: number, f: number): void;
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
    resetTransform(): void;
    createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient;
    createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient;
    drawImage(image: any, dx: number, dy: number, dw?: number, dh?: number, sx?: number, sy?: number, sw?: number, sh?: number): void;
    getImageData(sx: number, sy: number, sw: number, sh: number): ImageData;
    putImageData(imageData: ImageData, dx: number, dy: number, dirtyX?: number, dirtyY?: number, dirtyWidth?: number, dirtyHeight?: number): void;
    createImageData(sw: number, sh: number): ImageData;
    isPointInPath(x: number, y: number, fillRule?: CanvasFillRule): boolean;
    isPointInStroke(x: number, y: number): boolean;
  }
  
  export interface TextMetrics {
    width: number;
  }
  
  export interface ImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
  }
  
  export interface CanvasGradient {
    addColorStop(offset: number, color: string): void;
  }
  
  export interface CanvasPattern {}
  
  type CanvasTextAlign = 'start' | 'end' | 'left' | 'right' | 'center';
  type CanvasTextBaseline = 'top' | 'hanging' | 'middle' | 'alphabetic' | 'ideographic' | 'bottom';
  type GlobalCompositeOperation = 'source-over' | 'source-in' | 'source-out' | 'source-atop' | 'destination-over' | 'destination-in' | 'destination-out' | 'destination-atop' | 'lighter' | 'copy' | 'xor' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light' | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity';
  type CanvasLineCap = 'butt' | 'round' | 'square';
  type CanvasLineJoin = 'round' | 'bevel' | 'miter';
  type CanvasFillRule = 'nonzero' | 'evenodd';
}
