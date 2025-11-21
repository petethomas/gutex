import readline from 'readline';

export class KeyboardHandler {
  constructor() {
    this.callbacks = {
      forward: null,
      backward: null,
      quit: null
    };
  }

  onForward(callback) {
    this.callbacks.forward = callback;
  }

  onBackward(callback) {
    this.callbacks.backward = callback;
  }

  onQuit(callback) {
    this.callbacks.quit = callback;
  }

  start() {
    readline.emitKeypressEvents(process.stdin);
    
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    process.stdin.on('keypress', (str, key) => {
      if (!key) return;

      // Quit commands
      if (key.name === 'q' || key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        if (this.callbacks.quit) this.callbacks.quit();
        return;
      }

      // Forward commands: up, right, w, d
      if (key.name === 'up' || key.name === 'right' || key.name === 'w' || key.name === 'd') {
        if (this.callbacks.forward) this.callbacks.forward();
        return;
      }

      // Backward commands: down, left, s, a
      if (key.name === 'down' || key.name === 'left' || key.name === 's' || key.name === 'a') {
        if (this.callbacks.backward) this.callbacks.backward();
        return;
      }
    });
  }

  stop() {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
  }

  async prompt(message, choices) {
    this.stop();
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question(message, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }
}
