"""Repo-relative paths for the pipeline scripts that Stage 2 touches (terrain.py, render.py, make_relief.py).

The original archive hard-coded ``/home/claude/rhykaris_map/``. Here the heavy intermediates (``terrain_*.npz``,
about 190 MB) go to ``WORK`` — ``<repo>/work`` by default, or any folder named by the ``RHYKARIS_WORK`` environment
variable. Both are git-ignored. Canon outputs in ``assets/`` are never written by these scripts.
"""
import os

SRC = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(SRC)
ASSETS = os.path.join(ROOT, 'assets')
WORK = os.environ.get('RHYKARIS_WORK') or os.path.join(ROOT, 'work')


def work(name):
    """Absolute path of a file in the work folder (the folder is created on demand)."""
    os.makedirs(WORK, exist_ok=True)
    return os.path.join(WORK, name)
