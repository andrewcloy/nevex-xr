from __future__ import annotations

import logging
import sys
from pathlib import Path
from typing import TextIO


def configure_logging(
    level_name: str = "INFO",
    log_file: str | Path | None = None,
    console_stream: TextIO | None = None,
) -> None:
    root_logger = logging.getLogger()
    root_logger.setLevel(_parse_log_level(level_name))

    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    root_logger.handlers.clear()

    console_handler = logging.StreamHandler(console_stream or sys.stdout)
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    if log_file is not None:
        resolved_log_file = Path(log_file).expanduser().resolve()
        resolved_log_file.parent.mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(resolved_log_file, encoding="utf-8")
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


def _parse_log_level(level_name: str) -> int:
    normalized = level_name.strip().upper()
    level = getattr(logging, normalized, None)
    if not isinstance(level, int):
        raise ValueError(f"Unsupported log level: {level_name}")
    return level
