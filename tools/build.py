from pathlib import Path
import json,re
source=Path('script.js').read_text()
assert '// @version      6.7.12' in source
marker='class VideoPlayer extends BaseStreamPlayer'
assert source.count(marker)==1
# Embed shader assets once for both userscript and standalone test player.
a=source.index('class WebGL2Player');b=source.index(marker,a)
cas=re.search(r'gl.shaderSource\(fShader, `([^`]+)`\)',source[a:b]).group(1)
cas=cas.replace('precision mediump float','precision highp float').replace('1.0 / maxRgb','1.0 / max(maxRgb, vec3(1e-6))').replace('inversesqrt(amplifyRgb)','inversesqrt(max(amplifyRgb, vec3(1e-6)))')
shaders={p.stem:p.read_text() for p in Path('src/shaders').glob('*.glsl')}
shaders['cas']=cas
# Keep the reference CAS unchanged apart from avoiding 0/0 on pure black.
shaders['casFiltered']=cas.replace('return mix(e, outColor, sharpenFactor / 2.0);','return clamp(mix(e, outColor, sharpenFactor / 2.0), minRgb * (qualityMode ? 0.5 : 1.0) - vec3(4.0/255.0), maxRgb * (qualityMode ? 0.5 : 1.0) + vec3(4.0/255.0));')
bundle='globalThis.BxShaders='+json.dumps(shaders)+';\n'+Path('src/restoration-engine.js').read_text()
Path('output/restoration.bundle.js').parent.mkdir(parents=True,exist_ok=True)
Path('output/restoration.bundle.js').write_text(bundle)
# Repair upstream singleton lifecycle: a destroyed canvas must be recreated next session.
old='destroy() {this.cleanUpCanvasPlayer();}}'
assert source.count(old)==1
source=source.replace(old,'destroy() {this.cleanUpCanvasPlayer();this.playerType = \"default\";}}')
menu='\"video.processing.sharpness\",\"video.saturation\"'
assert source.count(menu)==1
source=source.replace(menu,'\"video.processing.sharpness\",($parent) => {window.BxImageFilter.mountControls($parent);},\"video.saturation\"')
source=source.replace(marker,bundle+'\n'+Path('src/image-filter.js').read_text()+'\n'+marker)
source=source.replace('// @name         Better xCloud','// @name         Better xCloud — Image Filter Experimental').replace('// @version      6.7.12','// @version      6.7.12-imagefilter.7')
source='\n'.join(line for line in source.split('\n') if not line.startswith(('// @updateURL','// @downloadURL')))
source=source.replace('// @grant        none','// @grant        none\n// @updateURL    none\n// @downloadURL  none').replace('CheckForUpdate: !0','CheckForUpdate: !1',1)
Path('better-xcloud-image-filter.user.js').write_text(source)
print('Built userscript v7 and shared player bundle')
