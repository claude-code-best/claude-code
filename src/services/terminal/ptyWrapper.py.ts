/**
 * python3 PTY 包装脚本（内联常量）。
 *
 * 为什么不用 node-pty：Bun 1.3.x 下 node-pty 的 master 读取端不出数据
 * （实测：输入回显可达、子 shell 输出丢失），python3 的 pty 模块在
 * macOS/Linux 上全平台自带且实测可靠。脚本运行时被写入临时文件执行。
 *
 * 协议：
 * - stdio：父进程 stdin → pty master（键入）；pty master → stdout（输出）
 * - resize：父进程写 `$CCB_PTY_SIZE_FILE`（"rows cols"）后发 SIGWINCH
 * - 前台信号：SIGUSR1 → 对前台进程组发 SIGTERM；SIGUSR2 → SIGKILL
 * - 退出：shell 退出码原样透传
 */
export const PTY_WRAPPER_SOURCE = `
import fcntl
import os
import select
import signal
import struct
import sys
import termios

size_file = os.environ.get("CCB_PTY_SIZE_FILE", "")

pid, master_fd = os.forkpty()
if pid == 0:
    os.execvp(sys.argv[1], sys.argv[1:])

def apply_size(*_args):
    try:
        with open(size_file) as f:
            rows, cols = (int(x) for x in f.read().split())
        fcntl.ioctl(
            master_fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0)
        )
        os.kill(pid, signal.SIGWINCH)
    except Exception:
        pass

def fg_signal(sig):
    def handler(*_args):
        try:
            pgid = os.tcgetpgrp(master_fd)
            if pgid > 0:
                os.killpg(pgid, sig)
        except Exception:
            pass
    return handler

signal.signal(signal.SIGWINCH, apply_size)
signal.signal(signal.SIGUSR1, fg_signal(signal.SIGTERM))
signal.signal(signal.SIGUSR2, fg_signal(signal.SIGKILL))
if size_file:
    apply_size()

stdin_fd = 0
stdout_fd = 1
stdin_open = True

def write_all(fd, data):
    view = memoryview(data)
    while view:
        written = os.write(fd, view)
        view = view[written:]

while True:
    watch = [master_fd] + ([stdin_fd] if stdin_open else [])
    try:
        rfds, _wfds, _xfds = select.select(watch, [], [])
    except InterruptedError:
        continue
    except OSError:
        break
    if master_fd in rfds:
        try:
            data = os.read(master_fd, 65536)
        except OSError:
            data = b""
        if not data:
            break
        try:
            write_all(stdout_fd, data)
        except (BrokenPipeError, OSError):
            # The Bun parent closed its pipe (for example after a tab was
            # closed). Exit the wrapper cleanly instead of surfacing a noisy
            # traceback as terminal output.
            break
    if stdin_open and stdin_fd in rfds:
        try:
            data = os.read(stdin_fd, 65536)
        except OSError:
            data = b""
        if not data:
            # 父进程关闭了 stdin（进程退出）——结束会话
            break
        os.write(master_fd, data)

try:
    os.kill(pid, signal.SIGHUP)
except Exception:
    pass
try:
    _pid, status = os.waitpid(pid, 0)
    if os.WIFEXITED(status):
        sys.exit(os.WEXITSTATUS(status))
    sys.exit(1)
except Exception:
    sys.exit(0)
`
