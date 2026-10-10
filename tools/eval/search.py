"""Coordinate search of treatment settings on the evaluation set.

Objective: perceived sharpness equal to the clean render (correlated detail >= 0.97)
with the highest fidelity (SSIM-Y); chroma PSNR breaks ties.
Usage: python3 tools/eval/search.py [1080|1280] > output/eval/search-<target>.log
"""
import json, sys
sys.path.insert(0, 'tools/eval')
from run_eval import Evaluator

target = sys.argv[1] if len(sys.argv) > 1 else '1080'
SPACE = {
    'sharpness': [0, 1, 2, 3, 4, 5, 6, 8],
    'detail': [0, .2, .35, .5, .7, 1],
    'deband': [0, .15, .3, .5, .75, 1],
    'cleanup': [0, .2, .35, .5, .75, 1],
    'chroma': [0, .25, .5, .75, 1],
    'antialias': [0, .25, .5],
    'processing': ['cas', 'usm'],
    'processingMode': ['performance', 'quality'],
    'sharpening': ['native', 'rcas'],
}
def objective(m): return m['ssim'] + .001 * m['chroma'] - (max(0, .97 - m['detail']) * 1.0)
e = Evaluator(); seen = {}
def evaluate(s):
    key = json.dumps(s, sort_keys=True)
    if key not in seen:
        m, _ = e.score(s, target=target); seen[key] = (objective(m), m)
        print(json.dumps({'settings': s, 'metrics': m, 'score': round(seen[key][0], 5)}), flush=True)
    return seen[key][0]
best = {'sharpness': 2, 'detail': .35, 'deband': .3, 'cleanup': .35, 'chroma': .5, 'antialias': 0, 'processing': 'cas', 'processingMode': 'performance', 'sharpening': 'native'}
best_score = evaluate(best)
for round_ in range(2):
    for key, values in SPACE.items():
        for v in values:
            candidate = {**best, key: v}
            score = evaluate(candidate)
            if score > best_score: best, best_score = candidate, score
    print(json.dumps({'round': round_, 'best': best, 'score': round(best_score, 5), 'metrics': seen[json.dumps(best, sort_keys=True)][1]}), flush=True)
e.close()
