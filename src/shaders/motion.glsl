#version 300 es
precision highp float;
uniform sampler2D source, previous, cut;
uniform vec2 outputSize;
uniform bool validHistory;
out vec4 fragColor;
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
float matchingError(vec2 uv,vec2 candidate,vec2 stepSize){
 float error=0.;for(int i=0;i<5;i++){
  vec2 d=i==0?vec2(0):i==1?vec2(1,0):i==2?vec2(-1,0):i==3?vec2(0,1):vec2(0,-1);
  error+=abs(lum(texture(source,uv+d*stepSize).rgb)-lum(texture(previous,uv+(d+candidate)*stepSize).rgb))*.2;
 }return error+length(candidate)*.00001;
}
void main(){
 if(!validHistory||texture(cut,vec2(.5)).r>.12){fragColor=vec4(.5,.5,0,1);return;}
 vec2 uv=gl_FragCoord.xy/outputSize,stepSize=1./vec2(textureSize(source,0));
 float best=10.,second=10.;vec2 offset=vec2(0);
 // Keep the fine local search, then search coarse offsets up to 32 source pixels.
 for(int pass=0;pass<2;pass++)for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++){
  if(pass==1&&x==0&&y==0)continue;
  vec2 candidate=vec2(x,y)*(pass==0?1.:4.);float error=matchingError(uv,candidate,stepSize);
  if(error<best){second=best;best=error;offset=candidate;}else second=min(second,error);
 }
 vec2 coarse=offset;
 // Refine only a winning coarse vector. Maximum supported displacement is 40px.
 if(any(greaterThan(abs(coarse),vec2(2))))for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++){
  vec2 candidate=coarse+vec2(x,y);
  if(all(lessThanEqual(abs(candidate),vec2(2)))||all(lessThan(abs(mod(candidate,4.)),vec2(.001))))continue;
  float error=matchingError(uv,candidate,stepSize);
  if(error<best){second=best;best=error;offset=candidate;}else second=min(second,error);
 }
 float confidence=(1.-smoothstep(.008,.045,best))*smoothstep(.0002,.004,second-best);
 fragColor=vec4(offset/20.+.5,confidence,1.);
}
