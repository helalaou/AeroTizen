"""Legacy desktop handshake, retained only until sidecar packaging is removed."""

import json
import sys

from aerotizen import __version__

PROTOCOL_VERSION = 1
WORKER_NAME = "aerotizen-desktop-worker"
MAX_REQUEST_BYTES = 16 * 1024
OPERATIONS = ("handshake",)


class RequestError(ValueError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def validate_request(request):
    if (
        not isinstance(request, dict)
        or type(request.get("protocol")) is not int
        or request["protocol"] != PROTOCOL_VERSION
        or not isinstance(request.get("id"), str)
        or not 0 < len(request["id"]) <= 80
        or request.get("operation") not in OPERATIONS
        or not isinstance(request.get("params", {}), dict)
    ):
        raise RequestError("invalid_request", "The desktop request is invalid or incompatible.")
    return request.get("params", {})


def handle(request):
    request_id = request.get("id") if isinstance(request, dict) else None
    response = {"protocol": PROTOCOL_VERSION, "id": request_id}
    try:
        validate_request(request)
        result = {"name": WORKER_NAME, "version": __version__, "operations": list(OPERATIONS)}
        return {**response, "result": result}
    except RequestError as error:
        return {**response, "error": {"code": error.code, "message": str(error)}}


def main():
    line = sys.stdin.buffer.readline(MAX_REQUEST_BYTES + 1)
    try:
        if len(line) > MAX_REQUEST_BYTES:
            raise ValueError
        request = json.loads(line)
    except (ValueError, UnicodeError):
        request = None
    print(json.dumps(handle(request), separators=(",", ":")), flush=True)


if __name__ == "__main__":
    main()
