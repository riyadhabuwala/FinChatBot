from pathlib import Path


def normalize_path(file_path: str) -> Path:
    return Path(file_path).expanduser().resolve()


def ensure_dir(dir_path: str | Path) -> Path:
    path = Path(dir_path)
    path.mkdir(parents=True, exist_ok=True)
    return path
