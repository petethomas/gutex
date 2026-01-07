/**
 * Mobile Zoom and Text Selection Prevention Tests
 * 
 * Tests the CSS and JavaScript protections against:
 * 1. Accidental pinch-to-zoom on mobile devices
 * 2. Unintended text selection on canvas and UI elements
 * 3. iOS Safari gesture handling
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// From dist/test/, go up to project root to read source files
const cssContent = readFileSync(join(__dirname, '../../src/web-ui/web-ui.css'), 'utf-8');
const tsContent = readdirSync(join(__dirname, '../../src/web-ui/modules')).filter(f => f.endsWith('.ts')).map(f => readFileSync(join(__dirname, '../../src/web-ui/modules', f), 'utf-8')).join('\n');
const htmlContent = readFileSync(join(__dirname, '../../src/web-ui/web-ui-template.html'), 'utf-8');

// ============================================================
// VIEWPORT META TAG TESTS
// ============================================================

describe('Viewport meta tag configuration', () => {
  it('should have viewport meta tag with user-scalable=no', () => {
    assert.ok(htmlContent.includes('user-scalable=no'), 
      'Viewport should have user-scalable=no to prevent zoom');
  });

  it('should have viewport meta tag with maximum-scale=1.0', () => {
    assert.ok(htmlContent.includes('maximum-scale=1.0'), 
      'Viewport should have maximum-scale=1.0 to prevent zoom');
  });

  it('should have viewport meta tag with minimum-scale=1.0', () => {
    assert.ok(htmlContent.includes('minimum-scale=1.0'), 
      'Viewport should have minimum-scale=1.0 to prevent zoom');
  });

  it('should have viewport-fit=cover for iOS safe areas', () => {
    assert.ok(htmlContent.includes('viewport-fit=cover'), 
      'Viewport should have viewport-fit=cover for iOS notch handling');
  });
});

// ============================================================
// CSS TOUCH-ACTION TESTS
// ============================================================

describe('CSS touch-action properties', () => {
  it('body should have touch-action: pan-x pan-y to prevent pinch zoom', () => {
    // Body should allow panning but not zooming
    assert.ok(cssContent.includes('touch-action: pan-x pan-y'), 
      'Body should have touch-action: pan-x pan-y');
  });

  it('canvas-3d should have touch-action: none', () => {
    // The canvas should block all default touch behaviors
    const canvas3dMatch = cssContent.match(/\.canvas-3d\s*\{[^}]+\}/);
    assert.ok(canvas3dMatch, 'canvas-3d CSS rule should exist');
    assert.ok(canvas3dMatch[0].includes('touch-action: none'), 
      'canvas-3d should have touch-action: none');
  });

  it('interactive elements should have touch-action: manipulation', () => {
    // Buttons and other interactive elements should have manipulation
    assert.ok(cssContent.includes('button') && cssContent.includes('touch-action: manipulation'), 
      'Interactive elements should have touch-action: manipulation');
  });

  it('overlays and modals should have touch-action: none', () => {
    // Modals should not allow touch zoom
    assert.ok(cssContent.includes('.bookmark-overlay') && cssContent.includes('touch-action: none'), 
      'Overlays should have touch-action: none');
  });

  it('html should have overscroll-behavior: none', () => {
    assert.ok(cssContent.includes('overscroll-behavior: none'), 
      'HTML should have overscroll-behavior: none to prevent pull-to-refresh');
  });
});

// ============================================================
// CSS USER-SELECT TESTS
// ============================================================

describe('CSS user-select properties', () => {
  it('canvas-3d should have user-select: none', () => {
    const canvas3dMatch = cssContent.match(/\.canvas-3d\s*\{[^}]+\}/);
    assert.ok(canvas3dMatch, 'canvas-3d CSS rule should exist');
    assert.ok(canvas3dMatch[0].includes('user-select: none'), 
      'canvas-3d should have user-select: none');
  });

  it('canvas-3d should have -webkit-user-select: none', () => {
    const canvas3dMatch = cssContent.match(/\.canvas-3d\s*\{[^}]+\}/);
    assert.ok(canvas3dMatch, 'canvas-3d CSS rule should exist');
    assert.ok(canvas3dMatch![0].includes('-webkit-user-select: none'), 
      'canvas-3d should have -webkit-user-select: none for Safari');
  });

  it('header should have user-select: none', () => {
    const headerMatch = cssContent.match(/^\s*header\s*\{[^}]+\}/m);
    assert.ok(headerMatch, 'header CSS rule should exist');
    assert.ok(headerMatch[0].includes('user-select: none'), 
      'Header should have user-select: none');
  });

  it('footer should have user-select: none', () => {
    // Footer content should not be selectable
    assert.ok(cssContent.includes('footer') && cssContent.includes('user-select: none'), 
      'Footer should have user-select: none');
  });

  it('overlays should have user-select: none', () => {
    // Overlays should block selection
    assert.ok(cssContent.includes('.bookmark-overlay') && cssContent.includes('user-select: none'), 
      'Overlays should have user-select: none');
  });

  it('mobile main element should have user-select: none except #content', () => {
    // On mobile, main should not be selectable
    assert.ok(cssContent.includes('main') && cssContent.includes('user-select: none'), 
      'Main should have user-select: none on mobile');
    
    // But #content should allow text selection
    assert.ok(cssContent.includes('#content') && cssContent.includes('user-select: text'), 
      '#content should have user-select: text for reading');
  });
});

// ============================================================
// CSS WEBKIT-TOUCH-CALLOUT TESTS
// ============================================================

describe('CSS webkit-touch-callout properties', () => {
  it('body should have -webkit-touch-callout: none', () => {
    assert.ok(cssContent.includes('-webkit-touch-callout: none'), 
      'Body should have -webkit-touch-callout: none');
  });

  it('canvas-3d should have -webkit-touch-callout: none', () => {
    const canvas3dMatch = cssContent.match(/\.canvas-3d\s*\{[^}]+\}/);
    assert.ok(canvas3dMatch, 'canvas-3d CSS rule should exist');
    assert.ok(canvas3dMatch![0].includes('-webkit-touch-callout: none'), 
      'canvas-3d should have -webkit-touch-callout: none');
  });

  it('interactive elements should have -webkit-touch-callout: none', () => {
    // Buttons etc should not show iOS callout
    assert.ok(cssContent.includes('button') && cssContent.includes('-webkit-touch-callout: none'), 
      'Interactive elements should have -webkit-touch-callout: none');
  });
});

// ============================================================
// JAVASCRIPT GESTURE EVENT HANDLERS
// ============================================================

describe('JavaScript gesture event handlers', () => {
  it('should have gesturestart event handler', () => {
    assert.ok(tsContent.includes("addEventListener('gesturestart'"), 
      'Should have gesturestart event handler for iOS Safari');
  });

  it('gesturestart handler should preventDefault', () => {
    const gestureStartMatch = tsContent.match(/addEventListener\('gesturestart'[\s\S]*?e\.preventDefault\(\)/);
    assert.ok(gestureStartMatch, 
      'gesturestart handler should call preventDefault');
  });

  it('should have gesturechange event handler', () => {
    assert.ok(tsContent.includes("addEventListener('gesturechange'"), 
      'Should have gesturechange event handler for iOS Safari');
  });

  it('gesturechange handler should preventDefault', () => {
    const gestureChangeMatch = tsContent.match(/addEventListener\('gesturechange'[\s\S]*?e\.preventDefault\(\)/);
    assert.ok(gestureChangeMatch, 
      'gesturechange handler should call preventDefault');
  });

  it('should have gestureend event handler', () => {
    assert.ok(tsContent.includes("addEventListener('gestureend'"), 
      'Should have gestureend event handler for iOS Safari');
  });

  it('gesture handlers should use passive: false', () => {
    // All gesture handlers need passive: false to allow preventDefault
    const gestureHandlers = tsContent.match(/addEventListener\('gesture\w+[\s\S]*?\{ passive: false \}/g);
    assert.ok(gestureHandlers && gestureHandlers.length >= 3, 
      'All gesture handlers should have { passive: false }');
  });
});

// ============================================================
// JAVASCRIPT TOUCH EVENT HANDLERS FOR MULTI-TOUCH
// ============================================================

describe('JavaScript multi-touch zoom prevention', () => {
  it('should track touch count', () => {
    assert.ok(tsContent.includes('lastTouchCount') || tsContent.includes('e.touches.length'), 
      'Should track touch count for multi-touch detection');
  });

  it('touchstart should prevent default for multi-touch', () => {
    // Should check for multiple touches and prevent
    assert.ok(tsContent.includes('e.touches.length > 1') && tsContent.includes('preventDefault'), 
      'touchstart should prevent default when more than 1 touch');
  });

  it('touchmove should prevent default for multi-touch', () => {
    // touchmove should prevent zoom when multiple fingers
    assert.ok(tsContent.includes('touchmove') && tsContent.includes('e.touches.length > 1'), 
      'touchmove should check for multiple touches');
  });

  it('touch handlers should use passive: false', () => {
    // Touch handlers that call preventDefault need passive: false
    assert.ok(tsContent.includes("addEventListener('touchstart'") && 
              tsContent.includes("addEventListener('touchmove'"), 
      'Should have touchstart and touchmove handlers');
  });
});

// ============================================================
// DOUBLE-TAP ZOOM PREVENTION
// ============================================================

describe('Double-tap zoom prevention', () => {
  it('should track lastTouchEnd time', () => {
    assert.ok(tsContent.includes('lastTouchEnd'), 
      'Should track lastTouchEnd time for double-tap detection');
  });

  it('should check time between touches', () => {
    // Should check for 300ms threshold
    assert.ok(tsContent.includes('300') && tsContent.includes('lastTouchEnd'), 
      'Should check for double-tap within 300ms');
  });

  it('should prevent default on double-tap of interactive elements', () => {
    // Should prevent on buttons, links, etc
    assert.ok(tsContent.includes('closest(') && tsContent.includes('button'), 
      'Should prevent double-tap zoom on buttons');
  });
});

// ============================================================
// MOBILE DETECTION
// ============================================================

describe('Mobile detection', () => {
  it('should detect mobile devices', () => {
    assert.ok(tsContent.includes('isMobile'), 
      'Should have isMobile detection');
  });

  it('should detect iOS devices', () => {
    assert.ok(tsContent.includes('isIOS'), 
      'Should have isIOS detection');
  });

  it('should add is-mobile class to body', () => {
    assert.ok(tsContent.includes("classList.add('is-mobile')"), 
      'Should add is-mobile class to body');
  });

  it('should add is-ios class to body', () => {
    assert.ok(tsContent.includes("classList.add('is-ios')"), 
      'Should add is-ios class to body');
  });
});

// ============================================================
// CONTEXT MENU PREVENTION
// ============================================================

describe('Context menu prevention', () => {
  it('should have contextmenu event handler', () => {
    assert.ok(tsContent.includes("addEventListener('contextmenu'"), 
      'Should have contextmenu event handler');
  });

  it('should prevent context menu on interactive elements', () => {
    assert.ok(tsContent.includes('contextmenu') && tsContent.includes('preventDefault'), 
      'Should prevent context menu on interactive elements');
  });
});

// ============================================================
// TAP HIGHLIGHT PREVENTION
// ============================================================

describe('Tap highlight prevention', () => {
  it('should have -webkit-tap-highlight-color: transparent', () => {
    assert.ok(cssContent.includes('-webkit-tap-highlight-color: transparent'), 
      'Should have tap highlight color set to transparent');
  });
});

// ============================================================
// MOBILE MEDIA QUERY RULES
// ============================================================

describe('Mobile media query rules', () => {
  it('should have mobile-specific media query', () => {
    assert.ok(cssContent.includes('@media (max-width: 768px)') || 
              cssContent.includes('@media (pointer: coarse)'), 
      'Should have mobile-specific media query');
  });

  it('should have combined mobile/touch media query', () => {
    assert.ok(cssContent.includes('(max-width: 768px), (pointer: coarse)'), 
      'Should have combined mobile/touch media query');
  });
});

// ============================================================
// INTEGRATION: ALL ZOOM PREVENTION LAYERS
// ============================================================

describe('Integration: Complete zoom prevention', () => {
  it('should have all three layers of zoom prevention', () => {
    // Layer 1: Viewport meta tag
    const hasViewport = htmlContent.includes('user-scalable=no');
    
    // Layer 2: CSS touch-action
    const hasTouchAction = cssContent.includes('touch-action: pan-x pan-y') || 
                          cssContent.includes('touch-action: none');
    
    // Layer 3: JS gesture handlers
    const hasGestureHandlers = tsContent.includes('gesturestart') && 
                               tsContent.includes('gesturechange');
    
    assert.ok(hasViewport && hasTouchAction && hasGestureHandlers, 
      'Should have all three layers: viewport, CSS touch-action, and JS gesture handlers');
  });

  it('should have all three layers of selection prevention', () => {
    // Layer 1: CSS user-select
    const hasUserSelect = cssContent.includes('user-select: none');
    
    // Layer 2: CSS -webkit-user-select
    const hasWebkitUserSelect = cssContent.includes('-webkit-user-select: none');
    
    // Layer 3: CSS -webkit-touch-callout
    const hasTouchCallout = cssContent.includes('-webkit-touch-callout: none');
    
    assert.ok(hasUserSelect && hasWebkitUserSelect && hasTouchCallout, 
      'Should have all three layers: user-select, -webkit-user-select, -webkit-touch-callout');
  });
});
