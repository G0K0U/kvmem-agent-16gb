"""Launch the isolated ComfyUI source with the existing CUDA Python runtime."""
from pathlib import Path
import runpy
import sys

root = Path(__file__).resolve().parent
# The portable interpreter has its previous ComfyUI checkout in python313._pth.
sys.path[:] = [p for p in sys.path if not (Path(p) / 'comfy' / 'model_management.py').is_file()]
sys.path.insert(0, str(root / 'deps'))
sys.path.insert(0, str(root / 'ComfyUI'))
runpy.run_path(str(root / 'ComfyUI' / 'main.py'), run_name='__main__')
