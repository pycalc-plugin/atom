"use babel";

import { CompositeDisposable } from "atom";
import * as path from "path";

const keyEnabled = "pycalc_enabled";

export default {
  subscriptions: null,
  worker: null,
  timer: null,
  editors: [],

  executePythonCode(code, multiline) {
    if (multiline) {
      code = "1" + code;
    } else {
      code = "0" + code;
    }

    if (this.worker) {
      this.worker.postMessage(code);
    }
  },

  printResult(text) {
    const editor = atom.workspace.getActiveTextEditor();
    if (!editor) {
      return;
    }

    editor.insertText(text);
  },

  onEnter() {
    if (!this.isEnabled()) {
      return;
    }

    const editor = atom.workspace.getActiveTextEditor();
    if (!editor) {
      return;
    }

    const pos = editor.getCursorBufferPosition();
    const line = editor.getTextInBufferRange([[pos.row, 0], [pos.row, pos.column]]);

    this.executePythonCode(line, false);
  },

  getCursorPos(selection) {
    if (selection.isReversed) {
      return selection.anchor;
    }

    return selection.active;
  },

  calcSelected() {
    const editor = atom.workspace.getActiveTextEditor();
    if (!editor) {
      return;
    }

    const pycode = editor.getSelectedText();

    let selection = editor.getLastSelection();
    if (selection) {
      const end = selection.getBufferRange().end;
      editor.setCursorBufferPosition(end);
    }

    if (!pycode.endsWith("\n")) {
      editor.insertText("\n");
    }

    this.executePythonCode(pycode, true);
  },

  checkLongRunning() {
    const self = this;

    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const notification = atom.notifications.addWarning(
        "The Python code has been running for a long time. Do you want to terminate it?", {
        dismissable: true,
        buttons: [
          {
            text: "Yes",
            onDidClick: function () {
              self.worker.terminate();
              self.worker = null;
              self.createWorker();
              return notification.dismiss();
            }
          },
          {
            text: "No",
            onDidClick: function () {
              return notification.dismiss();
            }
          }
        ]
      });

      notification.onDidDismiss(() => {
        self.checkLongRunning();
      });
    }, 30000);
  },

  createWorker() {
    const workerPath = path.join(__dirname, "worker.js");
    this.worker = new Worker(workerPath);
    this.checkLongRunning();

    this.worker.onmessage = (event) => {
      this.checkLongRunning();

      const message = event.data

      if ("stdout" in message) {
        const text = message["stdout"].join("");

        this.printResult(text)
      }

      if ("stderr" in message) {
        let error = message["stderr"].join("");

        const regex = / {2}(File "<\w+>", line \d+(, in <module>|).*)/s;
        const match = error.match(regex);
        if (match) {
          error = match[1]
        }
        atom.notifications.addError(error).dismiss();
      }
    }

    this.worker.onerror = (error) => {
      atom.notifications.addError(error.toString()).dismiss();
    }
  },

  releaseWorker() {
    if (this.worker) {
      clearTimeout(this.timer);
      this.worker.terminate();
      this.worker = null;
    }
  },

  updateContextMenu(value) {
    this.getContextMenu("pycalc:enable").visible = value;
    this.getContextMenu("pycalc:disable").visible = !value;
  },

  isEnabled() {
    let enabled = atom.config.get(keyEnabled);

    if (enabled === undefined) {
      enabled = true;
      atom.config.set(keyEnabled, enabled);
    }

    return enabled;
  },

  setEnabled(enabled) {
    atom.config.set(keyEnabled, enabled);
  },

  pluginEnable() {
    this.releaseWorker();

    this.createWorker();

    this.setEnabled(true);
    this.updateContextMenu(true);
  },

  pluginDisable() {
    this.setEnabled(false);
    this.updateContextMenu(false);
  },

  init() {
    const editor = document.querySelector("atom-text-editor.editor.is-focused");
    if (!editor || this.editors.includes(editor)) {
      return;
    }

    this.editors.push(editor);

    editor.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        this.onEnter();
      }
    })
  },

  getContextMenu(command) {
    return atom.contextMenu.itemSets
      .filter(itemSet => itemSet.selector === "atom-text-editor")
      .map(itemSet => itemSet.items.filter(item => item.command === command))
      .flat().shift();
  },

  activate(state) {
    this.updateContextMenu(this.isEnabled());

    this.createWorker();

    this.subscriptions = new CompositeDisposable();
    this.subscriptions.add(atom.commands.add("atom-workspace", {
      "pycalc:enable": () => this.pluginDisable()
    }));

    this.subscriptions.add(atom.commands.add("atom-workspace", {
      "pycalc:disable": () => this.pluginEnable()
    }));

    this.subscriptions.add(atom.commands.add("atom-workspace", {
      "pycalc:selected": () => this.calcSelected()
    }));

    setInterval(this.init.bind(this), 250);
  },

  deactivate() {
    this.subscriptions.dispose();
  },

  serialize() {
  }
};
