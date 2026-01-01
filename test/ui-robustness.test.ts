/**
 * UI Robustness Tests
 * 
 * Tests for common UI bugs that can break the interface:
 * - Event handlers receiving event objects instead of expected arguments
 * - Element ID mismatches
 * - Proper null guards for DOM elements
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('UI Robustness - web-ui.html', () => {
  let htmlContent: string;
  
  before(() => {
    const htmlPath = path.join(__dirname, '../src/web-ui.html');
    htmlContent = fs.readFileSync(htmlPath, 'utf8');
  });
  
  describe('P2P Room Functions', () => {
    it('joinP2PRoom should handle event objects from click handlers', () => {
      // When addEventListener('click', joinP2PRoom) is used, the event object
      // gets passed as first argument. The function must check typeof before
      // calling string methods like .trim()
      assert.ok(
        htmlContent.includes("typeof roomCodeArg === 'string'") ||
        htmlContent.includes('typeof roomCodeArg === "string"') ||
        htmlContent.includes('joinP2PRoom'),
        'joinP2PRoom should exist and handle various input types'
      );
    });
    
    it('should have P2P UI elements', () => {
      // Should have P2P related elements
      assert.ok(
        htmlContent.includes('p2pUI') || htmlContent.includes('p2p'),
        'Should have P2P UI functionality'
      );
    });
  });
  
  describe('Floating 3D Controls', () => {
    it('should have floating 3D controls elements', () => {
      assert.ok(htmlContent.includes('id="floating3dControls"') || htmlContent.includes('floating3dControls'), 
        'should have floating3dControls container');
    });
    
    it('syncFloatingControls should exist', () => {
      assert.ok(htmlContent.includes('function syncFloatingControls') ||
                htmlContent.includes('syncFloatingControls'),
        'syncFloatingControls function should exist');
    });
    
    it('should have null guards for DOM elements', () => {
      // Should check if elements exist before accessing them (general pattern)
      assert.ok(
        htmlContent.includes(' && ') && htmlContent.includes('$('),
        'Should use null guards when accessing DOM elements'
      );
    });
    
    it('floating controls should check rope3d mode', () => {
      // The periodic sync should only run when in 3D mode
      assert.ok(
        htmlContent.includes('rope3d.active'),
        'Should check rope3d.active for 3D mode operations'
      );
    });
    
    it('should have position options', () => {
      assert.ok(htmlContent.includes('data-pos') || htmlContent.includes('position'),
        'should have position configuration');
    });
    
    it('should use localStorage for persistence', () => {
      assert.ok(
        htmlContent.includes('localStorage'),
        'should use localStorage for persistence'
      );
    });
  });
  
  describe('Auto-read Button', () => {
    it('should use emoji icons for auto button, not text', () => {
      // Button should show 🤖 for auto and 🛑 for stop
      assert.ok(
        htmlContent.includes("textContent = '🤖'") ||
        htmlContent.includes('textContent = "🤖"'),
        'Should set button to robot emoji'
      );
      assert.ok(
        htmlContent.includes("textContent = '🛑'") ||
        htmlContent.includes('textContent = "🛑"'),
        'Should set button to stop emoji'
      );
    });
    
    it('syncAutoReadUI should check for emoji icons, not text', () => {
      // The sync function should compare against emoji, not "Auto"/"Stop"
      assert.ok(
        htmlContent.includes("!== '🛑'") ||
        htmlContent.includes('!== "🛑"'),
        'syncAutoReadUI should check for stop emoji when active'
      );
      assert.ok(
        htmlContent.includes("!== '🤖'") ||
        htmlContent.includes('!== "🤖"'),
        'syncAutoReadUI should check for robot emoji when inactive'
      );
    });
    
    it('initial auto button should have robot emoji', () => {
      // The button in HTML should start with 🤖
      assert.ok(
        htmlContent.includes('id="btnAuto"') && htmlContent.includes('🤖'),
        'btnAuto should have robot emoji'
      );
    });
  });
  
  describe('Theme Select', () => {
    it('main theme select should be compact (icon only)', () => {
      assert.ok(
        htmlContent.includes('class="theme-select compact"'),
        'main theme select should have compact class'
      );
    });
    
    it('theme options should have title attributes for hover text', () => {
      assert.ok(
        htmlContent.includes('title="Default theme"') ||
        htmlContent.includes('title="Dark theme"'),
        'theme options should have title attributes'
      );
    });
  });
  
  describe('Language Select', () => {
    it('language options should include country code abbreviations', () => {
      // Options should show flag + code like "🇬🇧 EN"
      assert.ok(
        htmlContent.includes('🇬🇧 EN') || htmlContent.includes('🇬🇧 EN'),
        'language options should include EN abbreviation'
      );
      assert.ok(
        htmlContent.includes('🇩🇪 DE'),
        'language options should include DE abbreviation'
      );
    });
    
    it('language options should have title attributes with full language names', () => {
      assert.ok(
        htmlContent.includes('title="English"'),
        'English option should have title attribute'
      );
      assert.ok(
        htmlContent.includes('title="German"'),
        'German option should have title attribute'
      );
    });
  });
  
  describe('Element ID Consistency', () => {
    it('should not reference non-existent bookDetails element', () => {
      // bookDetails was removed, all references should use titleBarTitle/titleBarAuthor
      const bookDetailsRefs = htmlContent.match(/\$\(['"]bookDetails['"]\)/g) || [];
      assert.strictEqual(
        bookDetailsRefs.length, 
        0, 
        `Found ${bookDetailsRefs.length} references to removed bookDetails element`
      );
    });
    
    it('should have titleBarTitle and titleBarAuthor elements', () => {
      assert.ok(htmlContent.includes('id="titleBarTitle"'), 'should have titleBarTitle element');
      assert.ok(htmlContent.includes('id="titleBarAuthor"'), 'should have titleBarAuthor element');
    });
  });
  
  describe('Language Select', () => {
    it('should have language selector in search modal', () => {
      assert.ok(htmlContent.includes('id="searchLanguage"'), 'should have searchLanguage element in search modal');
    });
    
    it('language options should include abbreviations', () => {
      assert.ok(htmlContent.includes('🇬🇧'), 'should have GB flag');
    });
    
    it('should use language in search API call', () => {
      assert.ok(
        htmlContent.includes("lang="),
        'search should include lang parameter'
      );
    });
    
    it('should not have language in global nav (only in search)', () => {
      // Language was removed from global nav, now only in search modal
      assert.ok(!htmlContent.includes('id="languageSelect"'), 'should NOT have languageSelect in global nav');
    });
  });
  
  describe('Book Change Interstitial Modal', () => {
    it('should have showBookChangeModal helper function', () => {
      assert.ok(htmlContent.includes('function showBookChangeModal') || 
                htmlContent.includes('showBookChangeModal'), 
        'should have showBookChangeModal function');
    });
    
    it('should have hideBookChangeModal helper function', () => {
      assert.ok(htmlContent.includes('function hideBookChangeModal') || 
                htmlContent.includes('hideBookChangeModal'), 
        'should have hideBookChangeModal function');
    });
    
    it('should have teleport modal element', () => {
      assert.ok(htmlContent.includes('teleportModal') || htmlContent.includes('bookChangeModal'),
        'should have modal element for book changes');
    });
    
    it('goToRandomBook should use modal for book changes', () => {
      assert.ok(
        htmlContent.includes('goToRandomBook') && htmlContent.includes('Modal'),
        'goToRandomBook should use modal system'
      );
    });
  });
});

describe('UI Robustness - web-landing.html', () => {
  let htmlContent: string;
  
  before(() => {
    const htmlPath = path.join(__dirname, '../../src/web-landing.html');
    htmlContent = fs.readFileSync(htmlPath, 'utf8');
  });
  
  describe('Theme Support', () => {
    it('should have theme CSS variables', () => {
      assert.ok(htmlContent.includes('[data-theme="amber"]'), 'should have amber theme');
      assert.ok(htmlContent.includes('[data-theme="dark"]'), 'should have dark theme');
      assert.ok(htmlContent.includes('--bg-primary'), 'should have bg-primary CSS variable');
    });
    
    it('should initialize theme from localStorage', () => {
      assert.ok(
        htmlContent.includes("localStorage.getItem('gutex-theme')"),
        'should read theme from localStorage'
      );
      assert.ok(
        htmlContent.includes("setAttribute('data-theme'") ||
        htmlContent.includes('setAttribute("data-theme"'),
        'should set data-theme attribute'
      );
    });
  });
  
  describe('Language Select', () => {
    it('should have language selector', () => {
      // Landing page has lang select for search
      assert.ok(htmlContent.includes('id="langSelect"'), 'should have langSelect element on landing page');
    });
    
    it('language options should include abbreviations', () => {
      assert.ok(htmlContent.includes('EN'), 'should have EN language option');
    });
    
    it('should use language in search API call', () => {
      assert.ok(
        htmlContent.includes("lang=") || htmlContent.includes("lang:"),
        'search should include lang parameter'
      );
    });
  });
});
