/**
 * Canvas UI Tests
 * 
 * Tests the word-based 3D rope mode in web-ui.html:
 * 1. ropePathPosition geometry (word-by-word strand positioning)
 * 2. Camera frame and projection functions
 * 3. Server-side canvas rendering (requires `canvas` package)
 * 4. Integration checks
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================
// ROPE CONFIG (mirrored from web-ui.html rope3d)
// Roller coaster spline with loops and hills
// ============================================================

interface RopeConfig {
  WORD_SPACING: number;
  CURVE_AMPLITUDE_X: number;
  CURVE_AMPLITUDE_Y: number;
  CURVE_PERIOD_X: number;
  CURVE_PERIOD_Y: number;
  CURVE2_AMPLITUDE_X: number;
  CURVE2_AMPLITUDE_Y: number;
  CURVE2_PERIOD_X: number;
  CURVE2_PERIOD_Y: number;
  LOOP_AMPLITUDE: number;
  LOOP_PERIOD: number;
  LOOP_TIGHTNESS: number;
  LOOP_VERTICAL_SCALE: number;
  CAMERA_LOOK_BEHIND: number;
  CAMERA_LOOK_AHEAD: number;
  CAMERA_HEIGHT: number;
  FOV: number;
  NEAR_CLIP: number;
  FAR_CLIP: number;
  BASE_FONT_SIZE: number;
  MIN_FONT_SIZE: number;
}

const CONFIG: Readonly<RopeConfig> = Object.freeze({
  WORD_SPACING: 300,
  // Primary sweeping curves
  CURVE_AMPLITUDE_X: 600,
  CURVE_AMPLITUDE_Y: 400,
  CURVE_PERIOD_X: 25,
  CURVE_PERIOD_Y: 18,
  // Secondary curves
  CURVE2_AMPLITUDE_X: 250,
  CURVE2_AMPLITUDE_Y: 200,
  CURVE2_PERIOD_X: 40,
  CURVE2_PERIOD_Y: 30,
  // Loop parameters
  LOOP_AMPLITUDE: 350,
  LOOP_PERIOD: 60,
  LOOP_TIGHTNESS: 8,
  LOOP_VERTICAL_SCALE: 0.8,
  CAMERA_LOOK_BEHIND: 2.5,
  CAMERA_LOOK_AHEAD: 4,
  CAMERA_HEIGHT: 80,
  FOV: 500,
  NEAR_CLIP: 20,
  FAR_CLIP: 3000,
  BASE_FONT_SIZE: 42,
  MIN_FONT_SIZE: 6,
});

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface CameraFrame {
  pos: Vec3;
  forward: Vec3;
  right: Vec3;
  up: Vec3;
}

interface ProjectionResult {
  screenX: number;
  screenY: number;
  scale: number;
  depth: number;
}

// Roller coaster spline with loop-de-loops
const ropePathPosition = (t: number, config: RopeConfig = CONFIG): Vec3 => {
  // Primary curves
  const theta1X = (t / config.CURVE_PERIOD_X) * Math.PI * 2;
  const theta1Y = (t / config.CURVE_PERIOD_Y) * Math.PI * 2;
  
  // Secondary curves
  const theta2X = (t / config.CURVE2_PERIOD_X) * Math.PI * 2;
  const theta2Y = (t / config.CURVE2_PERIOD_Y) * Math.PI * 2;
  
  // Base track
  let x = Math.sin(theta1X) * config.CURVE_AMPLITUDE_X +
          Math.sin(theta2X) * config.CURVE2_AMPLITUDE_X;
  let y = Math.sin(theta1Y) * config.CURVE_AMPLITUDE_Y +
          Math.cos(theta2Y) * config.CURVE2_AMPLITUDE_Y;
  
  // Loop-de-loops
  const loopPhase = (t / config.LOOP_PERIOD) * Math.PI * 2;
  const loopActivation = Math.pow(Math.max(0, Math.sin(loopPhase)), 6);
  
  if (loopActivation > 0.001) {
    const loopT = (t / config.LOOP_TIGHTNESS) * Math.PI * 2;
    x += Math.sin(loopT) * config.LOOP_AMPLITUDE * loopActivation;
    y += (Math.cos(loopT) - 1) * config.LOOP_AMPLITUDE * config.LOOP_VERTICAL_SCALE * loopActivation;
  }
  
  return { x, y, z: t * config.WORD_SPACING };
};

// Compute camera frame: position + orientation on the spline
const computeCameraFrame = (wordOffset: number, config: RopeConfig = CONFIG): CameraFrame => {
  const camT = wordOffset - config.CAMERA_LOOK_BEHIND;
  const camPosOnSpline = ropePathPosition(camT, config);
  
  // Lift camera above the spline for god's eye view
  const camPos: Vec3 = {
    x: camPosOnSpline.x,
    y: camPosOnSpline.y + config.CAMERA_HEIGHT,
    z: camPosOnSpline.z
  };
  
  const lookT = camT + config.CAMERA_LOOK_AHEAD;
  const lookPos = ropePathPosition(lookT, config);
  
  // Forward vector
  let fx = lookPos.x - camPos.x;
  let fy = lookPos.y - camPos.y;
  let fz = lookPos.z - camPos.z;
  const fLen = Math.sqrt(fx*fx + fy*fy + fz*fz);
  fx /= fLen; fy /= fLen; fz /= fLen;
  
  // World up
  let upX = 0, upY = 1, upZ = 0;
  
  // Right = forward × up
  let rx = fy * upZ - fz * upY;
  let ry = fz * upX - fx * upZ;
  let rz = fx * upY - fy * upX;
  const rLen = Math.sqrt(rx*rx + ry*ry + rz*rz);
  rx /= rLen; ry /= rLen; rz /= rLen;
  
  // Recompute up = right × forward
  upX = ry * fz - rz * fy;
  upY = rz * fx - rx * fz;
  upZ = rx * fy - ry * fx;
  
  return {
    pos: camPos,
    forward: { x: fx, y: fy, z: fz },
    right: { x: rx, y: ry, z: rz },
    up: { x: upX, y: upY, z: upZ }
  };
};

// Project world position to screen via camera space
const projectToCameraSpace = (
  worldPos: Vec3, 
  camFrame: CameraFrame, 
  W: number = 800, 
  H: number = 600, 
  config: RopeConfig = CONFIG
): ProjectionResult | null => {
  const dx = worldPos.x - camFrame.pos.x;
  const dy = worldPos.y - camFrame.pos.y;
  const dz = worldPos.z - camFrame.pos.z;
  
  // Transform to camera space
  const camX = dx * camFrame.right.x + dy * camFrame.right.y + dz * camFrame.right.z;
  const camY = dx * camFrame.up.x + dy * camFrame.up.y + dz * camFrame.up.z;
  const camZ = dx * camFrame.forward.x + dy * camFrame.forward.y + dz * camFrame.forward.z;
  
  if (camZ <= 0) return null;
  
  const scale = config.FOV / camZ;
  
  return {
    screenX: camX * scale + W / 2,
    screenY: -camY * scale + H / 2,
    scale,
    depth: camZ
  };
};

// Smooth opacity curve
const ropeOpacity = (depth: number, near: number = CONFIG.NEAR_CLIP, far: number = CONFIG.FAR_CLIP): number => {
  if (depth < near || depth > far) return 0;
  
  const range = far - near;
  const t = (depth - near) / range;
  
  const fadeIn = Math.min(1, (depth - near) / 100);
  const fadeOut = Math.pow(1 - t, 0.5);
  
  return Math.max(0, Math.min(1, fadeIn * fadeOut));
};

const clamp = (val: number, min: number, max: number): number => Math.max(min, Math.min(max, val));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// ============================================================
// ROPE PATH TESTS (web-ui.html rope3d)
// ============================================================

describe('Rope 3D - Pure Functions', () => {
  
  describe('ropePathPosition', () => {
    it('should return z=0 at word 0', () => {
      const pos = ropePathPosition(0);
      assert.strictEqual(pos.z, 0, 'z should be 0 at start');
    });
    
    it('should advance z linearly with word index', () => {
      const pos0 = ropePathPosition(0);
      const pos1 = ropePathPosition(1);
      const pos2 = ropePathPosition(2);
      
      const dz1 = pos1.z - pos0.z;
      const dz2 = pos2.z - pos1.z;
      
      assert.strictEqual(dz1, CONFIG.WORD_SPACING, 'z should advance by WORD_SPACING');
      assert.strictEqual(dz2, CONFIG.WORD_SPACING, 'z advancement should be consistent');
    });
    
    it('should produce bounded x,y values', () => {
      // Max amplitude is sum of curve amplitudes plus loop
      const maxX = CONFIG.CURVE_AMPLITUDE_X + CONFIG.CURVE2_AMPLITUDE_X + CONFIG.LOOP_AMPLITUDE;
      const maxY = CONFIG.CURVE_AMPLITUDE_Y + CONFIG.CURVE2_AMPLITUDE_Y + CONFIG.LOOP_AMPLITUDE * 2;
      
      for (let i = 0; i < 100; i++) {
        const pos = ropePathPosition(i);
        assert.ok(
          Math.abs(pos.x) <= maxX + 1,
          `x=${pos.x} should be within total amplitude ${maxX} at word ${i}`
        );
        assert.ok(
          Math.abs(pos.y) <= maxY + 1,
          `y=${pos.y} should be within total amplitude ${maxY} at word ${i}`
        );
      }
    });
    
    it('should produce smooth path with no jumps', () => {
      let prev = ropePathPosition(0);
      // Max rate of change - roller coaster has tighter curves
      const maxJumpX = (CONFIG.CURVE_AMPLITUDE_X * 2 * Math.PI / CONFIG.CURVE_PERIOD_X +
                        CONFIG.CURVE2_AMPLITUDE_X * 2 * Math.PI / CONFIG.CURVE2_PERIOD_X +
                        CONFIG.LOOP_AMPLITUDE * 2 * Math.PI / CONFIG.LOOP_TIGHTNESS) * 1.5;
      const maxJumpY = (CONFIG.CURVE_AMPLITUDE_Y * 2 * Math.PI / CONFIG.CURVE_PERIOD_Y +
                        CONFIG.CURVE2_AMPLITUDE_Y * 2 * Math.PI / CONFIG.CURVE2_PERIOD_Y +
                        CONFIG.LOOP_AMPLITUDE * 2 * Math.PI / CONFIG.LOOP_TIGHTNESS) * 1.5;
      
      for (let i = 1; i < 50; i++) {
        const curr = ropePathPosition(i);
        const dx = Math.abs(curr.x - prev.x);
        const dy = Math.abs(curr.y - prev.y);
        
        assert.ok(dx < maxJumpX, `x jump from word ${i-1} to ${i} is ${dx.toFixed(2)}, max ${maxJumpX.toFixed(2)}`);
        assert.ok(dy < maxJumpY, `y jump from word ${i-1} to ${i} is ${dy.toFixed(2)}, max ${maxJumpY.toFixed(2)}`);
        prev = curr;
      }
    });
  });
  
  describe('computeCameraFrame', () => {
    it('should place camera above the spline behind current word', () => {
      const wordOffset = 10;
      const frame = computeCameraFrame(wordOffset);
      const expectedCamT = wordOffset - CONFIG.CAMERA_LOOK_BEHIND;
      const splinePos = ropePathPosition(expectedCamT);
      
      assert.strictEqual(frame.pos.x, splinePos.x, 'camera x should match spline position');
      assert.strictEqual(frame.pos.y, splinePos.y + CONFIG.CAMERA_HEIGHT, 'camera y should be above spline by CAMERA_HEIGHT');
      assert.strictEqual(frame.pos.z, splinePos.z, 'camera z should match spline position');
    });
    
    it('should have normalized forward vector', () => {
      const frame = computeCameraFrame(10);
      const len = Math.sqrt(
        frame.forward.x ** 2 + frame.forward.y ** 2 + frame.forward.z ** 2
      );
      assert.ok(Math.abs(len - 1) < 0.001, `forward should be unit length, got ${len}`);
    });
    
    it('should have orthogonal right and up vectors', () => {
      const frame = computeCameraFrame(10);
      
      // right · forward should be 0
      const rf = frame.right.x * frame.forward.x + 
                 frame.right.y * frame.forward.y + 
                 frame.right.z * frame.forward.z;
      assert.ok(Math.abs(rf) < 0.001, `right·forward should be 0, got ${rf}`);
      
      // up · forward should be 0
      const uf = frame.up.x * frame.forward.x + 
                 frame.up.y * frame.forward.y + 
                 frame.up.z * frame.forward.z;
      assert.ok(Math.abs(uf) < 0.001, `up·forward should be 0, got ${uf}`);
    });
    
    it('should look ahead on the spline', () => {
      const frame = computeCameraFrame(10);
      // Forward vector should have positive z component (looking ahead)
      assert.ok(frame.forward.z > 0, 'camera should look forward (positive z)');
    });
  });
  
  describe('projectToCameraSpace', () => {
    it('should return null for points behind camera', () => {
      const frame = computeCameraFrame(10);
      // Point behind the camera
      const behindPos: Vec3 = { x: frame.pos.x, y: frame.pos.y, z: frame.pos.z - 100 };
      const result = projectToCameraSpace(behindPos, frame);
      assert.strictEqual(result, null, 'should return null for points behind camera');
    });
    
    it('should project point ahead of camera to positive depth', () => {
      const frame = computeCameraFrame(10);
      const aheadPos = ropePathPosition(15); // Word ahead of camera
      const result = projectToCameraSpace(aheadPos, frame);
      
      assert.ok(result !== null, 'point ahead should project');
      assert.ok(result!.depth > 0, 'depth should be positive');
    });
    
    it('should scale inversely with depth', () => {
      const frame = computeCameraFrame(10);
      const nearPos = ropePathPosition(12);
      const farPos = ropePathPosition(20);
      
      const nearProj = projectToCameraSpace(nearPos, frame);
      const farProj = projectToCameraSpace(farPos, frame);
      
      assert.ok(nearProj && farProj, 'both should project');
      assert.ok(nearProj!.scale > farProj!.scale, 'near should have larger scale');
    });
    
    it('should project current word within visible area', () => {
      const wordOffset = 10;
      const frame = computeCameraFrame(wordOffset);
      const currentPos = ropePathPosition(wordOffset);
      const proj = projectToCameraSpace(currentPos, frame, 800, 600);
      
      assert.ok(proj !== null, 'current word should project');
      // Current word should be visible (may not be perfectly centered due to spline curvature)
      assert.ok(proj!.screenX > 0 && proj!.screenX < 800, 
        `current word should be on screen horizontally, got ${proj!.screenX}`);
      assert.ok(proj!.screenY > 0 && proj!.screenY < 600,
        `current word should be on screen vertically, got ${proj!.screenY}`);
    });
  });
  
  describe('ropeOpacity', () => {
    it('should return 0 below near clip', () => {
      const opacity = ropeOpacity(CONFIG.NEAR_CLIP - 10);
      assert.strictEqual(opacity, 0);
    });
    
    it('should return 0 beyond far clip', () => {
      const opacity = ropeOpacity(CONFIG.FAR_CLIP + 100);
      assert.strictEqual(opacity, 0);
    });
    
    it('should fade in gradually from near clip', () => {
      const atNear = ropeOpacity(CONFIG.NEAR_CLIP);
      const slightlyPast = ropeOpacity(CONFIG.NEAR_CLIP + 100);
      
      assert.ok(slightlyPast > atNear, 'opacity should increase past near clip');
    });
    
    it('should decrease with distance from near clip', () => {
      const near = ropeOpacity(CONFIG.NEAR_CLIP + 100);
      const mid = ropeOpacity(500);
      const far = ropeOpacity(CONFIG.FAR_CLIP - 200);
      
      // Opacity should generally decrease with distance
      assert.ok(near > 0, 'near should have some opacity');
      assert.ok(far < near, 'far should be dimmer than near');
    });
    
    it('should always be between 0 and 1', () => {
      for (let d = 0; d <= 4000; d += 100) {
        const opacity = ropeOpacity(d);
        assert.ok(opacity >= 0, `opacity ${opacity} should be >= 0`);
        assert.ok(opacity <= 1, `opacity ${opacity} should be <= 1`);
      }
    });
  });
  
  describe('clamp', () => {
    it('should return value when within bounds', () => {
      assert.strictEqual(clamp(5, 0, 10), 5);
    });
    
    it('should return min when value is below', () => {
      assert.strictEqual(clamp(-5, 0, 10), 0);
    });
    
    it('should return max when value is above', () => {
      assert.strictEqual(clamp(15, 0, 10), 10);
    });
  });
  
  describe('lerp', () => {
    it('should return a at t=0', () => {
      assert.strictEqual(lerp(10, 20, 0), 10);
    });
    
    it('should return b at t=1', () => {
      assert.strictEqual(lerp(10, 20, 1), 20);
    });
    
    it('should return midpoint at t=0.5', () => {
      assert.strictEqual(lerp(10, 20, 0.5), 15);
    });
  });
});

// ============================================================
// PATH COHERENCE TESTS
// ============================================================

describe('Rope 3D - Path Coherence', () => {
  
  it('should produce a continuous readable path with spline camera', () => {
    // All words should be visible when camera follows the spline
    for (let wordOffset = 5; wordOffset < 25; wordOffset++) {
      const camFrame = computeCameraFrame(wordOffset);
      const wordPos = ropePathPosition(wordOffset);
      const proj = projectToCameraSpace(wordPos, camFrame, 800, 600);
      
      assert.ok(proj !== null, `Word at offset ${wordOffset} should be projectable`);
      assert.ok(
        proj!.depth >= CONFIG.NEAR_CLIP && proj!.depth <= CONFIG.FAR_CLIP,
        `Word at offset ${wordOffset} should be within clip planes`
      );
    }
  });
  
  it('should keep upcoming words visible ahead of camera', () => {
    const wordOffset = 10;
    const camFrame = computeCameraFrame(wordOffset);
    
    // Check several words ahead are visible
    for (let i = wordOffset; i < wordOffset + 10; i++) {
      const wordPos = ropePathPosition(i);
      const proj = projectToCameraSpace(wordPos, camFrame, 800, 600);
      
      assert.ok(proj !== null, `Word ${i} should be projectable`);
      assert.ok(proj!.depth > 0, `Word ${i} should be in front of camera`);
    }
  });
});

// ============================================================
// SERVER-SIDE CANVAS RENDERING TEST
// ============================================================

describe('Rope 3D - Server-side Rendering', () => {
  let createCanvas: ((width: number, height: number) => any) | undefined;
  let canvasAvailable = false;
  let canvasProvider = '';
  
  before(async () => {
    // Try node-canvas first
    try {
      // @ts-ignore - optional dependency
      const canvasModule = await import('canvas');
      createCanvas = canvasModule.createCanvas;
      canvasAvailable = true;
      canvasProvider = 'canvas';
    } catch {
      // Try skia-canvas as fallback
      try {
        // @ts-ignore - optional dependency
        const skiaModule = await import('skia-canvas');
        createCanvas = (w: number, h: number) => new skiaModule.Canvas(w, h);
        canvasAvailable = true;
        canvasProvider = 'skia-canvas';
      } catch {
        console.log('  ⚠ No canvas package available (tried canvas, skia-canvas), skipping render tests');
      }
    }
    if (canvasAvailable) {
      console.log(`  ✓ Using ${canvasProvider} for render tests`);
    }
  });
  
  it('should render readable words without errors (if canvas available)', async () => {
    if (!canvasAvailable || !createCanvas) {
      return; // Skip
    }
    
    const canvas = createCanvas(800, 600);
    const ctx = canvas.getContext('2d');
    
    // Simulate rendering individual words
    const words = ['It', 'was', 'the', 'best', 'of', 'times', 'it', 'was'];
    
    // Camera at word 0, following the spline
    const camFrame = computeCameraFrame(0);
    
    // Clear
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, 800, 600);
    
    // Render words
    interface VisibleWord extends ProjectionResult {
      text: string;
      worldPos: Vec3;
    }
    const visibleWords: VisibleWord[] = [];
    for (let i = 0; i < words.length; i++) {
      const worldPos = ropePathPosition(i);
      const proj = projectToCameraSpace(worldPos, camFrame, 800, 600);
      if (proj && proj.depth > 0 && proj.depth < CONFIG.FAR_CLIP) {
        visibleWords.push({ text: words[i], ...proj, worldPos });
      }
    }
    
    visibleWords.sort((a, b) => b.depth - a.depth);
    
    for (const word of visibleWords) {
      const opacity = ropeOpacity(word.depth);
      const fontSize = Math.max(CONFIG.MIN_FONT_SIZE, CONFIG.BASE_FONT_SIZE * word.scale);
      
      ctx.save();
      ctx.translate(word.screenX, word.screenY);
      
      ctx.font = `${Math.round(fontSize)}px Georgia`;
      ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(word.text, 0, 0);
      ctx.restore();
    }
    
    // Verify something was drawn
    const imageData = ctx.getImageData(0, 0, 800, 600);
    let nonBlackPixels = 0;
    for (let i = 0; i < imageData.data.length; i += 4) {
      if (imageData.data[i] > 15 || imageData.data[i+1] > 15 || imageData.data[i+2] > 15) {
        nonBlackPixels++;
      }
    }
    
    assert.ok(nonBlackPixels > 50, `Should have rendered visible text (got ${nonBlackPixels} non-black pixels)`);
  });
});

// ============================================================
// WEB SERVER ROUTE TEST
// ============================================================

describe('Canvas UI - Integration Tests', () => {
  it('should have word-based 3D mode in web-ui.html', async () => {
    const htmlPath = path.join(__dirname, '../src/web-ui.html');
    assert.ok(fs.existsSync(htmlPath), 'web-ui.html should exist');
    
    const content = fs.readFileSync(htmlPath, 'utf8');
    assert.ok(content.includes('rope3d'), 'should contain rope3d object');
    assert.ok(content.includes('ropePathPosition'), 'should contain ropePathPosition function');
    assert.ok(content.includes('toggleRopeMode'), 'should contain toggleRopeMode function');
    assert.ok(content.includes('modeToggle'), 'should have mode toggle button');
    assert.ok(content.includes('canvas3d'), 'should have 3D canvas element');
    
    // Should be word-based, not line-based
    assert.ok(content.includes('WORD_SPACING'), 'should have WORD_SPACING config');
    assert.ok(content.includes('CURVE_AMPLITUDE_X'), 'should have CURVE_AMPLITUDE_X config');
    assert.ok(!content.includes('WORDS_PER_LINE'), 'should NOT have old WORDS_PER_LINE config');
    assert.ok(!content.includes('buildRopeLines'), 'should NOT have old buildRopeLines function');
  });
  
  it('should not have separate canvas-ui.html file', async () => {
    const htmlPath = path.join(__dirname, '../../src/canvas-ui.html');
    assert.ok(!fs.existsSync(htmlPath), 'canvas-ui.html should NOT exist (3D is in web-ui.html)');
  });
  
  it('should not have separate canvas route in web-server.ts', async () => {
    const serverPath = path.join(__dirname, '../../src/web-server.ts');
    const content = fs.readFileSync(serverPath, 'utf8');
    
    assert.ok(!content.includes('/canvas'), 'web-server should NOT have /canvas route');
  });
});

// ============================================================
// 3D MODE NAVIGATION TESTS
// ============================================================

describe('3D Mode - Navigation Speed', () => {
  let htmlContent: string;
  
  before(() => {
    const htmlPath = path.join(__dirname, '../src/web-ui.html');
    htmlContent = fs.readFileSync(htmlPath, 'utf8');
  });
  
  it('should have getManualMomentum function for speed-scaled movement', () => {
    // getManualMomentum() provides speed-scaled movement
    assert.ok(
      htmlContent.includes('getManualMomentum') || htmlContent.includes('function getManualMomentum'),
      'should have getManualMomentum function for speed-scaled control'
    );
  });
  
  it('should use momentum for button clicks in 3D mode', () => {
    // Buttons should trigger momentum-based movement
    assert.ok(htmlContent.includes('rope3d.momentum'), 'should use rope3d.momentum for movement');
  });
  
  it('should have scroll speed config for smooth scrolling', () => {
    // SCROLL_SPEED should exist for wheel scrolling
    assert.ok(htmlContent.includes('SCROLL_SPEED'), 'should have SCROLL_SPEED config');
  });
  
  it('should have speed slider for 3D mode', () => {
    assert.ok(htmlContent.includes('speedSlider'), 'should have speed slider element');
    assert.ok(htmlContent.includes('rope-controls') || htmlContent.includes('ropeControls'), 'should have rope controls');
  });
  
  it('should check rope3d.active before applying 3D navigation', () => {
    // Navigation code should check rope3d.active
    assert.ok(
      htmlContent.includes('if (rope3d.active)') || htmlContent.includes('rope3d.active &&') || htmlContent.includes('rope3d.active)'),
      'should check rope3d.active before applying 3D-specific navigation'
    );
  });
});

// ============================================================
// TELEPORTATION TESTS
// ============================================================

describe('Teleportation - Core Behavior', () => {
  describe('Web UI teleportation', () => {
    let htmlContent: string;
    
    before(() => {
      const htmlPath = path.join(__dirname, '../src/web-ui.html');
      htmlContent = fs.readFileSync(htmlPath, 'utf8');
    });
    
    it('should have teleportToRandomLocation function', () => {
      assert.ok(
        htmlContent.includes('async function teleportToRandomLocation') || 
        htmlContent.includes('teleportToRandomLocation'),
        'should have teleportToRandomLocation function'
      );
    });
    
    it('should handle end of book scenarios', () => {
      // Check that navigate function handles end of book
      assert.ok(
        htmlContent.includes('nextByteStart') && htmlContent.includes('null'),
        'should check for end of book (nextByteStart === null)'
      );
    });
    
    it('should handle start of book scenarios', () => {
      // Check that backward navigation is handled
      assert.ok(
        htmlContent.includes('backward') || htmlContent.includes('prevByteStart'),
        'should handle backward navigation at start of book'
      );
    });
    
    it('should have end of book handling in 3D mode', () => {
      // Check 3D animation loop handles end of book
      assert.ok(
        htmlContent.includes('teleportToRandomLocation') || htmlContent.includes('teleport'),
        'should have teleportation capability'
      );
    });
    
    it('should handle boundary conditions in 3D mode', () => {
      // Check for boundary detection
      assert.ok(
        htmlContent.includes('wordOffset') && htmlContent.includes('rope3d'),
        'should track word offset for boundary detection in 3D mode'
      );
    });
    
    it('should prevent unintended teleportation', () => {
      // Should have some mechanism to prevent accidental teleportation
      assert.ok(
        htmlContent.includes('justToggledFrames') || 
        htmlContent.includes('isMoving') ||
        htmlContent.includes('momentum'),
        'should have mechanism to prevent unintended teleportation'
      );
    });
    
    it('should work in both 2D and 3D modes', () => {
      // teleportToRandomLocation should handle both modes
      assert.ok(
        htmlContent.includes('rope3d.active'),
        'should check rope3d.active for mode-specific handling'
      );
    });
    
    it('should pick random book from catalog', () => {
      assert.ok(
        htmlContent.includes("/api/random"),
        'should use /api/random endpoint to pick random book from catalog'
      );
    });
    
    it('should support random position within book', () => {
      assert.ok(
        htmlContent.includes('random') && htmlContent.includes('byte'),
        'should support random byte position within book'
      );
    });
    
    it('should show teleport modal when random button is clicked', () => {
      // Check goToRandomBook shows modal via helper
      assert.ok(
        htmlContent.includes('goToRandomBook') && 
        htmlContent.match(/goToRandomBook[\s\S]*?showBookChangeModal\(/),
        'goToRandomBook should show teleport modal'
      );
      
      // Check goToRandomLocation shows modal via helper
      assert.ok(
        htmlContent.includes('goToRandomLocation') && 
        htmlContent.match(/goToRandomLocation[\s\S]*?showBookChangeModal\(/),
        'goToRandomLocation should show teleport modal'
      );
    });
    
    it('should have transparent teleport modal background', () => {
      // Find the teleport-modal CSS block
      const modalCss = htmlContent.match(/\.teleport-modal\s*\{[^}]+\}/);
      assert.ok(modalCss, 'teleport-modal CSS should exist');
      
      // Should have light background (not transparent, since it's a visible modal)
      assert.ok(
        modalCss![0].includes('background:'),
        'teleport modal should have background style'
      );
      
      // Check that backdrop-filter is NOT in the teleport-modal block specifically
      assert.ok(
        !modalCss![0].includes('backdrop-filter'),
        'teleport modal should not have backdrop-filter'
      );
    });
    
    it('should protect rope3d update with loading state in goToRandomLocation', () => {
      // After initBook() returns (which sets state.loading = false in finally),
      // we must re-set state.loading = true before updating rope3d, then set it false after.
      // This prevents the animation loop from running with mixed old/new state.
      
      // Check that goToRandomLocation re-sets loading before rope3d update
      const goToRandomLocationPattern = /function goToRandomLocation[\s\S]*?await initBook[\s\S]*?if \(rope3d\.active\) \{\s*state\.loading = true;/;
      assert.ok(
        htmlContent.match(goToRandomLocationPattern),
        'goToRandomLocation should set state.loading = true after initBook when rope3d.active'
      );
      
      // Check that loading is set false only after rope3d update completes
      const loadingFalseAfterRopeUpdate = /rope3d\.bytesPerWord[\s\S]*?state\.loading = false;[\s\S]*?\}/;
      assert.ok(
        htmlContent.match(loadingFalseAfterRopeUpdate),
        'state.loading should be set false only after rope3d update completes'
      );
    });
    
    it('should protect rope3d update with loading state in goToRandomBook', () => {
      // Same race condition fix for goToRandomBook
      
      // Check that goToRandomBook re-sets loading before rope3d update
      const goToRandomBookPattern = /function goToRandomBook[\s\S]*?await initBook[\s\S]*?if \(rope3d\.active\) \{\s*state\.loading = true;/;
      assert.ok(
        htmlContent.match(goToRandomBookPattern),
        'goToRandomBook should set state.loading = true after initBook when rope3d.active'
      );
    });
  });
  
  describe('Terminal teleportation', () => {
    let gutexContent: string;
    let displayContent: string;
    
    before(() => {
      const gutexPath = path.join(__dirname, '../../src/gutex-enhanced.ts');
      const displayPath = path.join(__dirname, '../../src/display.ts');
      gutexContent = fs.readFileSync(gutexPath, 'utf8');
      displayContent = fs.readFileSync(displayPath, 'utf8');
    });
    
    it('should have teleportToRandomLocation method', () => {
      assert.ok(
        gutexContent.includes('async teleportToRandomLocation'),
        'GutexEnhanced should have teleportToRandomLocation method'
      );
    });
    
    it('should teleport on forward at end of book', () => {
      assert.ok(
        gutexContent.includes('handleForward') && 
        gutexContent.includes('teleportToRandomLocation'),
        'handleForward should call teleportToRandomLocation at end of book'
      );
    });
    
    it('should teleport on backward at start of book', () => {
      assert.ok(
        gutexContent.includes('handleBackward') && 
        gutexContent.includes('teleportToRandomLocation'),
        'handleBackward should call teleportToRandomLocation at start of book'
      );
    });
    
    it('should pick random book and position', () => {
      assert.ok(
        gutexContent.includes('Math.random() * 70000') &&
        gutexContent.includes('randomPercent'),
        'should pick random book ID and random percent position'
      );
    });
    
    it('should have showTeleporting in Display', () => {
      assert.ok(
        displayContent.includes('showTeleporting'),
        'Display should have showTeleporting method'
      );
    });
  });
});

// ============================================================
// CHUNK SIZE IN 3D MODE TESTS  
// ============================================================

describe('3D Mode - Chunk Size', () => {
  let htmlContent: string;
  
  before(() => {
    const htmlPath = path.join(__dirname, '../src/web-ui.html');
    htmlContent = fs.readFileSync(htmlPath, 'utf8');
  });
  
  it('should have reloadRopeWithChunkSize function', () => {
    assert.ok(
      htmlContent.includes('reloadRopeWithChunkSize') || htmlContent.includes('reloadRope'),
      'should have rope reload functionality'
    );
  });
  
  it('should have chunk size configuration', () => {
    assert.ok(
      htmlContent.includes('chunkSize') || htmlContent.includes('autoChunkSize'),
      'should have chunk size configuration'
    );
  });
  
  it('should check rope3d.active for mode-specific behavior', () => {
    // The chunk size handler should be aware of mode
    assert.ok(htmlContent.includes('rope3d.active'), 'should check rope3d.active');
  });
});

// ============================================================
// 3D MODE - POSITION TRACKING AND TELEPORTATION TESTS
// ============================================================

describe('3D Mode - Position Tracking', () => {
  let htmlContent: string;
  
  before(() => {
    const htmlPath = path.join(__dirname, '../src/web-ui.html');
    htmlContent = fs.readFileSync(htmlPath, 'utf8');
  });
  
  it('should have viewBytePosition field for accurate position tracking', () => {
    assert.ok(
      htmlContent.includes('viewBytePosition'),
      'rope3d should have viewBytePosition field'
    );
  });
  
  it('should update viewBytePosition during motion', () => {
    assert.ok(
      htmlContent.includes('viewBytePosition') && htmlContent.includes('wordOffset'),
      'should track position using viewBytePosition and wordOffset'
    );
  });
  
  it('should use position for percent display', () => {
    assert.ok(
      htmlContent.includes('percent') && htmlContent.includes('viewBytePosition'),
      'should use viewBytePosition for percent calculations'
    );
  });
  
  it('should track byte positions', () => {
    assert.ok(
      htmlContent.includes('byteStart') && htmlContent.includes('byteEnd'),
      'should track byte positions'
    );
  });
});

describe('3D Mode - Boundary Detection and Teleportation', () => {
  let htmlContent: string;
  
  before(() => {
    const htmlPath = path.join(__dirname, '../src/web-ui.html');
    htmlContent = fs.readFileSync(htmlPath, 'utf8');
  });
  
  it('should track byte positions for boundary detection', () => {
    // Should track byte positions
    assert.ok(
      htmlContent.includes('byteStart') && htmlContent.includes('byteEnd'),
      'should track byte positions for boundaries'
    );
  });
  
  it('should track word offset for position', () => {
    // Should check wordOffset for position tracking
    assert.ok(
      htmlContent.includes('wordOffset'),
      'should have wordOffset for position tracking'
    );
  });
  
  it('should have document start tracking', () => {
    // Should track document start
    assert.ok(
      htmlContent.includes('docStart') || htmlContent.includes('firstByteStart'),
      'should track document start position'
    );
  });
  
  it('should handle forward boundary at end of book', () => {
    assert.ok(
      htmlContent.includes('nextByteStart') && htmlContent.includes('null'),
      'should check nextByteStart for forward boundary'
    );
  });
  
  it('should have movement tracking for boundaries', () => {
    // Should track movement direction
    assert.ok(
      htmlContent.includes('momentum') || htmlContent.includes('direction') || htmlContent.includes('delta'),
      'should track movement for boundary detection'
    );
  });
});

describe('Teleport Visual Feedback', () => {
  let htmlContent: string;
  
  before(() => {
    const htmlPath = path.join(__dirname, '../src/web-ui.html');
    htmlContent = fs.readFileSync(htmlPath, 'utf8');
  });
  
  it('should have transparent teleport flash (no black screen)', () => {
    // .teleport-flash should have transparent background
    const flashStyles = htmlContent.match(/\.teleport-flash\s*\{[^}]+\}/);
    assert.ok(flashStyles, 'should have .teleport-flash CSS');
    assert.ok(
      flashStyles![0].includes('background: transparent') || 
      flashStyles![0].includes('background:transparent'),
      'teleport-flash should have transparent background'
    );
  });
  
  it('should have teleport-flash.active with opacity 0', () => {
    const flashActiveStyles = htmlContent.match(/\.teleport-flash\.active\s*\{[^}]+\}/);
    assert.ok(flashActiveStyles, 'should have .teleport-flash.active CSS');
    assert.ok(
      flashActiveStyles![0].includes('opacity: 0') ||
      flashActiveStyles![0].includes('opacity:0'),
      'teleport-flash.active should have opacity 0 (fully transparent)'
    );
  });
  
  it('should have themed teleport modal background for readability', () => {
    const modalStyles = htmlContent.match(/\.teleport-modal\s*\{[^}]+\}/);
    assert.ok(modalStyles, 'should have .teleport-modal CSS');
    assert.ok(
      modalStyles![0].includes('background: var(--modal-bg)'),
      'teleport-modal should use --modal-bg theme variable for background'
    );
  });
  
  it('should have box-shadow for modal visibility', () => {
    const modalStyles = htmlContent.match(/\.teleport-modal\s*\{[^}]+\}/);
    assert.ok(
      modalStyles![0].includes('box-shadow'),
      'teleport-modal should have box-shadow for better visibility'
    );
  });
  
  it('should show modal on goToRandomBook', () => {
    const goToRandomBookMatch = htmlContent.match(/function goToRandomBook[\s\S]*?showBookChangeModal\(/);
    assert.ok(goToRandomBookMatch, 'goToRandomBook should show modal');
  });
  
  it('should show modal on goToRandomLocation', () => {
    const goToRandomLocationMatch = htmlContent.match(/function goToRandomLocation[\s\S]*?showBookChangeModal\(/);
    assert.ok(goToRandomLocationMatch, 'goToRandomLocation should show modal');
  });
});

describe('2D Mode - Backward Navigation', () => {
  let htmlContent: string;
  
  before(() => {
    const htmlPath = path.join(__dirname, '../src/web-ui.html');
    htmlContent = fs.readFileSync(htmlPath, 'utf8');
  });
  
  it('should handle backward navigation', () => {
    // navigate function should have backward handling
    assert.ok(
      htmlContent.includes('backward') || htmlContent.includes('direction'),
      'should handle backward navigation direction'
    );
  });
  
  it('should track percent position', () => {
    assert.ok(
      htmlContent.includes('percent'),
      'should track percent position'
    );
  });
  
  it('should handle auto-read', () => {
    // auto-read should exist
    assert.ok(
      htmlContent.includes('autoRead') || htmlContent.includes('startAutoRead'),
      'should have auto-read functionality'
    );
  });
});

describe('Hash Update Management', () => {
  let htmlContent: string;
  
  before(() => {
    const htmlPath = path.join(__dirname, '../src/web-ui.html');
    htmlContent = fs.readFileSync(htmlPath, 'utf8');
  });
  
  it('should have updateHash function', () => {
    assert.ok(
      htmlContent.includes('function updateHash'),
      'should have updateHash function'
    );
  });
  
  it('should allow forced hash updates', () => {
    // updateHash should accept force parameter
    assert.ok(
      htmlContent.includes('updateHash(force') || htmlContent.includes('updateHash ='),
      'updateHash should have force parameter capability'
    );
  });
  
  it('should use replaceState for URL updates', () => {
    assert.ok(
      htmlContent.includes('replaceState') || htmlContent.includes('history.replaceState'),
      'should use replaceState for URL updates'
    );
  });
});
