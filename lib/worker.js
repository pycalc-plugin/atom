brython_min = require("./brython.min.js");
brython_stdlib = require("./brython_stdlib.js");


const stdin = [];
const stdout = [];
const stderr = [];
let heartbeat = performance.now();

const brython = brython_min.__BRYTHON__ || brython_stdlib.__BRYTHON__;
globalThis.$B = brython;
brython.curdir = ".";

const pycode = `
import code
import sys
import time
from browser import console, timer


help = """
def __help__():
    print('''Welcome to Python 3.13's help utility!

If this is your first time using Python, you should definitely check out
the tutorial on the internet at https://docs.python.org/3.13/tutorial/.''')

help = __help__
"""


def __sleep__(duration):
    delay = time.time() + duration
    while time.time() < delay:
        ...


class Stdout:
    buffer = ""
    request = ""

    def write(self, value):
        self.buffer += value

    def flush(self):
        if self.buffer == f"{self.request.strip()}\\n":
            self.buffer = ""
            return

        sys.__stdout__.write(self.buffer)
        sys.__stdout__.flush()
        self.buffer = ""


class Stderr:
    def write(self, value):
        sys.__stderr__.write(value)
        sys.__stderr__.flush()

    def flush(self):
        sys.__stderr__.flush()


def interact():
    global repl

    line = sys.stdin.read()
    if not line:
        return

    multiline, line = line[0], line[1:]
    sys.stdout.request = line
    try:
        if multiline == "1":
            repl.resetbuffer()
            repl.runcode(line)
        else:
            repl.push(line)
    except BaseException as e:
        sys.stderr.write(rerp(e))


sys.stderr = Stderr()
sys.stdout = Stdout()
time.sleep = __sleep__
timer.set_interval(interact, 10)
repl = code.InteractiveConsole()
repl.runcode(help)
`

function init() {
    const input = (message, _default) => {
        const runs = performance.now() - heartbeat;

        if (runs > 3 * 1000) {
            const result = { "heartbeat": heartbeat };
            heartbeat = performance.now();
            postMessage(result);
        }

        if (stdin.length == 0) {
            return null;
        }

        return stdin.shift();
    }

    globalThis.prompt = input;

    brython.imported._sys.stdin = {
        async readline() {
            return input();
        },
        read() {
            return input();
        }
    }

    brython.imported._sys.stdout = {
        write(content) {
            stdout.push(content);
        },
        flush() {
            if (stdout.length > 0) {
                postMessage({ "stdout": stdout });
                stdout.length = 0;
            }
        },
    },

        brython.imported._sys.stderr = {
            write(content) {
                stderr.push(content);
            },
            flush() {
                if (stderr.length > 0) {
                    postMessage({ "stderr": stderr });
                    stderr.length = 0;
                }
            },
        }

    brython.runPythonSource(pycode);
}

onmessage = (event) => {
    stdin.push(event.data);
}

init();
