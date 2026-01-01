// Type declarations for skia-canvas (optional dependency)
declare module 'skia-canvas' {
  export class Canvas {
    constructor(width: number, height: number);
    getContext(type: '2d'): CanvasRenderingContext2D;
    width: number;
    height: number;
  }
}
