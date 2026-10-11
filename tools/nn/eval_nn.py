"""Luma-only check of trained networks on the held-out evaluation set (tools/eval).
Usage: python3 tools/nn/eval_nn.py light med ...
"""
import json, sys
import numpy as np
import jax, jax.numpy as jnp
from PIL import Image

def luma(p): return np.asarray(Image.open(p), np.float32) @ np.array([.2126, .7152, .0722], np.float32) / 255
def net(name):
    L = json.load(open(f'src/nn/{name}.json'))['layers']
    def f(x):
        h = x[None, :, :, None]
        for i, l in enumerate(L):
            k = l['k'] // 2
            h = jnp.pad(h, ((0, 0), (k, k), (k, k), (0, 0)), mode='edge')
            h = jax.lax.conv_general_dilated(h, jnp.array(l['w'], jnp.float32), (1, 1), 'VALID', dimension_numbers=('NHWC', 'HWIO', 'NHWC')) + jnp.array(l['b'])
            if i < len(L) - 1: h = jax.nn.relu(h)
        return x + h[0, :, :, 0]
    g = jax.jit(f)
    return lambda x: np.asarray(g(x))
def box(a, r=4):
    c = np.cumsum(np.cumsum(np.pad(a, ((1, 0), (1, 0))), 0), 1); n = 2 * r
    return (c[n:, n:] - c[:-n, n:] - c[n:, :-n] + c[:-n, :-n]) / n / n
def ssim(a, b):
    a, b = a * 255, b * 255; ma, mb = box(a), box(b)
    va, vb, cab = box(a * a) - ma * ma, box(b * b) - mb * mb, box(a * b) - ma * mb
    C1, C2 = 6.5025, 58.5225
    return float(np.mean((2 * ma * mb + C1) * (2 * cab + C2) / ((ma * ma + mb * mb + C1) * (va + vb + C2))))
def lap(a): return 4 * a[1:-1, 1:-1] - a[:-2, 1:-1] - a[2:, 1:-1] - a[1:-1, :-2] - a[1:-1, 2:]
def usm(a, s):  # luma USM as in the engine (3x3 gaussian), without limiter
    p = np.pad(a, 1, mode='edge'); g = (p[:-2, :-2] + p[:-2, 2:] + p[2:, :-2] + p[2:, 2:] + 2 * (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:]) + 4 * a) / 16
    return np.clip(a + (a - g) * s / 1.2 / 3, 0, 1)
def metrics(o, r):
    lo, lr = lap(o), lap(r)
    return np.array([ssim(o, r), float((lo * lr).sum() / (lr * lr).sum()), float((lo * lo).sum() / (lr * lr).sum()), 10 * np.log10(1 / np.mean((o - r) ** 2))])
nets = {n: net(n) for n in sys.argv[1:]}
rows = {}
for scene in ('textures', 'sponza', 'sky'):
    for mbps in (10, 15, 20):
        for i in (24, 47):
            x = luma(f'output/eval/{scene}-{mbps}-{i}.png')[297:783, 540:1404]; r = luma(f'output/eval/{scene}-ref1080-{i}.png')[297:783, 540:1404]
            cands = {'stream': x, 'usm3 (v9-like)': usm(x, 3)}
            for n, f in nets.items():
                o = f(x); cands[n] = o
                for s in (1, 2, 3): cands[f'{n}+usm{s}'] = usm(o, s)
            for k, o in cands.items(): rows.setdefault(k, []).append(metrics(np.clip(o, 0, 1), r))
print('config'.ljust(18), 'SSIM    detail energy PSNR')
for k, v in rows.items():
    m = np.mean(v, 0); print(k.ljust(18), '%.4f  %.3f  %.3f  %.2f' % tuple(m))
