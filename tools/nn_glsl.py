"""Generates the WebGL2 shaders of the neural restoration from src/nn/restore.json.

Network (luma): f = relu(conv3x3 1->8); g = relu(conv1x1 8->8); dY = conv3x3 8->1.
Pass 'nnFeatures' writes g to two RGBA16F targets (MRT); 'nnApply' adds strength*dY to RGB.
Textures are uploaded with UNPACK_FLIP_Y, so a GL row offset +1 is an image row offset -1.
"""
import json

def f(v):
    s = '%.7g' % v
    return s if '.' in s or 'e' in s else s + '.0'

def generate(path):
    L = json.load(open(path))['layers']
    assert [(l['k'], l['cin'], l['cout']) for l in L] == [(3, 1, 8), (1, 8, 8), (3, 8, 1)], 'unsupported architecture'
    w1, b1, w2, b2, w3, b3 = L[0]['w'], L[0]['b'], L[1]['w'], L[1]['b'], L[2]['w'], L[2]['b']
    taps = [(dx, dy) for dy in (-1, 0, 1) for dx in (-1, 0, 1)]          # GL offsets
    ky = lambda dy: 1 - dy                                                 # image kernel row
    vec4 = lambda vals: 'vec4(' + ','.join(f(v) for v in vals) + ')'
    head = '#version 300 es\nprecision highp float;\nprecision highp sampler2D;\n'
    feat = [head, 'uniform sampler2D source;\nlayout(location=0) out vec4 featA;\nlayout(location=1) out vec4 featB;\n',
            'float Y(ivec2 p){return dot(texelFetch(source,clamp(p,ivec2(0),textureSize(source,0)-1),0).rgb,vec3(.2126,.7152,.0722));}\n',
            'void main(){ivec2 p=ivec2(gl_FragCoord.xy);\n vec4 hA=' + vec4(b1[:4]) + ',hB=' + vec4(b1[4:]) + ';float y;\n']
    for dx, dy in taps:
        k = w1[ky(dy)][dx + 1]
        feat.append(f' y=Y(p+ivec2({dx},{dy}));hA+=y*{vec4([k[0][c] for c in range(4)])};hB+=y*{vec4([k[0][c] for c in range(4, 8)])};\n')
    def mat(O, I):  # mat4 columns = input channels of block I, rows = output channels of block O
        return 'mat4(' + ','.join(f(w2[0][0][I * 4 + c][O * 4 + r]) for c in range(4) for r in range(4)) + ')'
    feat.append(' hA=max(hA,0.);hB=max(hB,0.);\n featA=max(' + vec4(b2[:4]) + '+' + mat(0, 0) + '*hA+' + mat(0, 1) + '*hB,0.);\n featB=max(' + vec4(b2[4:]) + '+' + mat(1, 0) + '*hA+' + mat(1, 1) + '*hB,0.);\n}\n')
    apply = [head, 'uniform sampler2D source,featA,featB;\nuniform float strength;\nout vec4 fragColor;\n',
             'void main(){ivec2 p=ivec2(gl_FragCoord.xy),m=textureSize(source,0)-1;float d=' + f(b3[0]) + ';\n']
    for dx, dy in taps:
        k = w3[ky(dy)][dx + 1]
        apply.append(f' {{ivec2 q=clamp(p+ivec2({dx},{dy}),ivec2(0),m);d+=dot(texelFetch(featA,q,0),{vec4([k[c][0] for c in range(4)])})+dot(texelFetch(featB,q,0),{vec4([k[c][0] for c in range(4, 8)])});}}\n')
    apply.append(' vec3 c=texelFetch(source,p,0).rgb;\n // Luma correction applied to all channels: chroma is left to the chroma stage.\n'
                 ' fragColor=vec4(clamp(c+vec3(strength*d),0.,1.),1);\n}\n')
    return ''.join(feat), ''.join(apply)

if __name__ == '__main__':
    a, b = generate('src/nn/restore.json'); print(a); print(b)
