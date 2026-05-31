import os
import sys

# Put the backend/ directory on sys.path so the pure-logic modules
# (logic.py, etc.) can be imported directly without DB/env side effects.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
