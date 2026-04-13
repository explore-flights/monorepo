import logging
import threading
import time
from functools import wraps
from typing import Callable

__TIMED_STACK = threading.local()


def timed(logger: logging.Logger, name: str):
    def decorator(fn):
        @wraps(fn)
        def wrapped(*args, **kwargs):
            return run_timed(logger, name, fn, *args, **kwargs)

        return wrapped

    return decorator


def run_timed(logger: logging.Logger, name: str, fn: Callable, *args, **kwargs):
    if not hasattr(__TIMED_STACK, "stack"):
        __TIMED_STACK.stack = []

    __TIMED_STACK.stack.append(name)
    full_name = ".".join(repr(s) for s in __TIMED_STACK.stack)

    start = time.perf_counter()
    logger.info("running %s", full_name)
    try:
        return fn(*args, **kwargs)
    finally:
        elapsed = time.perf_counter() - start
        logger.info("%s done within %.3fs", full_name, elapsed)

        __TIMED_STACK.stack.pop()
        if len(__TIMED_STACK.stack) < 1:
            delattr(__TIMED_STACK, "stack")
