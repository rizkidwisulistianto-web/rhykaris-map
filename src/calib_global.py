import numpy as np, json, time, sys
sys.path.insert(0,'/home/claude/rhykaris_map')
from masks import build, landmask
t0=time.time()
F = build(4096, 2048); land, comp = landmask(F)
T = np.load('/home/claude/rhykaris_map/terrain_4096.npz')
print('identical to saved land mask:', bool((land == T['land'].astype(bool)).all()), int((land != T['land'].astype(bool)).sum()))
json.dump(dict(stats=F['_stats'], th={k: float(v) for k, v in F['_th'].items()}), open('/home/claude/rhykaris_map/calib_4096.json','w'), indent=1)
print(F['_stats']); print(F['_th']); print(f'{time.time()-t0:.1f}s')
