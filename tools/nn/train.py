"""Trains the luma restoration network (residual CNN) with JAX on CPU.

Architecture (per pixel, luma in [0,1]):
  f = relu(conv3x3(Y, 1->C)); repeat K times: f = relu(conv1x1(f, C->C)) or conv3x3 if 'mid3';
  Y' = Y + conv3x3(f, C->1)
Loss: L1 on pixels + L1 on the Laplacian (detail), so the net restores texture instead of
only smoothing. Usage: python3 tools/nn/train.py <name> C K [mid3] [steps]
Writes src/nn/<name>.json (weights) and output/nn/<name>.log.
"""
import json, sys, time, os
import numpy as np
import jax, jax.numpy as jnp

name, C, K = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
mid3 = 'mid3' in sys.argv[4:]
LAP = float(os.environ.get('LAP', '.5'))  # weight of the detail (Laplacian) loss
steps = int(next((a for a in sys.argv[4:] if a.isdigit()), 8000))
data = np.load('output/nn/train.npz'); X = data['x'].astype(np.float32) / 255; Y = data['y'].astype(np.float32) / 255
rng = np.random.default_rng(0); idx = rng.permutation(len(X)); hold = idx[:512]; train = idx[512:]
layers = [(3, 1, C)] + [((3 if mid3 else 1), C, C)] * K + [(3, C, 1)]
pad = sum(k // 2 for k, _, _ in layers)

def init(key):
    params = []
    for i, (k, cin, cout) in enumerate(layers):
        key, sub = jax.random.split(key)
        scale = np.sqrt(2 / (k * k * cin)) * (0.1 if i == len(layers) - 1 else 1)
        params.append({'w': jax.random.normal(sub, (k, k, cin, cout)) * scale, 'b': jnp.zeros(cout)})
    return params

def forward(params, x):
    f = x[..., None]
    for i, p in enumerate(params):
        f = jax.lax.conv_general_dilated(f, p['w'], (1, 1), 'VALID', dimension_numbers=('NHWC', 'HWIO', 'NHWC')) + p['b']
        if i < len(params) - 1: f = jax.nn.relu(f)
    return x[:, pad:-pad, pad:-pad] + f[..., 0]

def lap(a): return 4 * a[:, 1:-1, 1:-1] - a[:, :-2, 1:-1] - a[:, 2:, 1:-1] - a[:, 1:-1, :-2] - a[:, 1:-1, 2:]

def loss(params, x, y):
    out = forward(params, x); t = y[:, pad:-pad, pad:-pad]
    return jnp.mean(jnp.abs(out - t)) + LAP * jnp.mean(jnp.abs(lap(out) - lap(t)))

@jax.jit
def step(params, m, v, t, x, y, lr):
    l, g = jax.value_and_grad(loss)(params, x, y)
    m = jax.tree_util.tree_map(lambda m, g: .9 * m + .1 * g, m, g)
    v = jax.tree_util.tree_map(lambda v, g: .999 * v + .001 * g * g, v, g)
    params = jax.tree_util.tree_map(lambda p, m, v: p - lr * (m / (1 - .9 ** t)) / (jnp.sqrt(v / (1 - .999 ** t)) + 1e-8), params, m, v)
    return params, m, v, l

params = init(jax.random.PRNGKey(0)); m = jax.tree_util.tree_map(jnp.zeros_like, params); v = jax.tree_util.tree_map(jnp.zeros_like, params)
xh, yh = jnp.array(X[hold]), jnp.array(Y[hold])
base = float(jnp.mean(jnp.abs(xh[:, pad:-pad, pad:-pad] - yh[:, pad:-pad, pad:-pad])))
log = open(f'output/nn/{name}.log', 'w'); t0 = time.time()
for t in range(1, steps + 1):
    b = rng.choice(train, 64)
    lr = 2e-3 * min(1, t / 300) * (0.5 * (1 + np.cos(np.pi * t / steps)) * .95 + .05)
    params, m, v, l = step(params, m, v, t, jnp.array(X[b]), jnp.array(Y[b]), lr)
    if t % 500 == 0 or t == steps:
        out = forward(params, xh); tl = yh[:, pad:-pad, pad:-pad]
        mae = float(jnp.mean(jnp.abs(out - tl)))
        msg = f'{name} step {t} loss {float(l):.5f} holdout MAE {mae*255:.3f} (input {base*255:.3f}) {time.time()-t0:.0f}s'
        print(msg, flush=True); log.write(msg + '\n')
os.makedirs('src/nn', exist_ok=True)
json.dump({'layers': [{'k': k, 'cin': cin, 'cout': cout, 'w': np.asarray(p['w']).round(6).tolist(), 'b': np.asarray(p['b']).round(6).tolist()} for (k, cin, cout), p in zip(layers, params)]},
          open(f'src/nn/{name}.json', 'w'))
