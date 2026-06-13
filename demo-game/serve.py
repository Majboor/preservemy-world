#!/usr/bin/env python3
"""Dev server with COOP/COEP headers for SharedArrayBuffer (required by SparkJS).

Usage:
  python3 serve.py [PORT] [--no-color] [-h|--help]

PORT defaults to 8090. Serves the directory this file lives in, so it works
regardless of the current working directory or platform (Windows/macOS/Linux).
"""
import argparse
import http.server
import os
import socket
import socketserver
import sys

DEFAULT_PORT = 8090

# --no-color, NO_COLOR (https://no-color.org/), or a non-TTY stdout disables ANSI.
def _use_color(force_off):
    if force_off or os.environ.get("NO_COLOR"):
        return False
    return sys.stdout.isatty()


def _c(text, code, enabled):
    return "\033[%sm%s\033[0m" % (code, text) if enabled else text


def parse_args(argv):
    parser = argparse.ArgumentParser(
        prog="serve.py",
        description="Dev server with COOP/COEP headers for SharedArrayBuffer.",
    )
    parser.add_argument(
        "port",
        nargs="?",
        default=DEFAULT_PORT,
        type=int,
        help="port to listen on (default: %d)" % DEFAULT_PORT,
    )
    parser.add_argument(
        "--no-color",
        action="store_true",
        help="disable colored output",
    )
    args = parser.parse_args(argv)
    if not (0 < args.port < 65536):
        parser.error("port must be between 1 and 65535 (got %d)" % args.port)
    return args


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):  # quieter, still visible on a TTY
        if sys.stderr.isatty():
            super().log_message(fmt, *args)


def main(argv=None):
    args = parse_args(sys.argv[1:] if argv is None else argv)
    color = _use_color(args.no_color)

    # Serve this script's directory no matter where it was invoked from.
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    socketserver.TCPServer.allow_reuse_address = True
    try:
        server = socketserver.TCPServer(("", args.port), Handler)
    except OSError as exc:
        if exc.errno in (48, 98, 10048):  # EADDRINUSE across macOS/Linux/Windows
            print(
                _c("error:", "1;31", color)
                + " port %d is already in use. Try another: python3 serve.py %d"
                % (args.port, args.port + 1),
                file=sys.stderr,
            )
        else:
            print(_c("error:", "1;31", color) + " %s" % exc, file=sys.stderr)
        return 1

    url = "http://localhost:%d/index.html" % args.port
    with server:
        print("\n  " + _c("Flight viewer:", "1;36", color) + " " + url)
        print("  Press Ctrl+C to stop.\n")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\n  Stopped.")
        finally:
            server.server_close()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BrokenPipeError:
        # Output was piped to something that closed early (e.g. `serve.py | head`).
        try:
            sys.stdout.close()
        except Exception:
            pass
        sys.exit(0)
