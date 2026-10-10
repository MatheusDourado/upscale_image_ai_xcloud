#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D source;
uniform float cleanup, deband, debandTaps;
uniform bool quantize;
out vec4 fragColor;
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
vec3 at(vec2 p){return texelFetch(source,clamp(ivec2(p),ivec2(0),textureSize(source,0)-1),0).rgb;}
void main(){
 vec2 p=gl_FragCoord.xy-.5;vec3 c=at(p), result=c;
 vec3 west=at(p-vec2(1,0)),east=at(p+vec2(1,0));
 vec3 south=at(p-vec2(0,1)),north=at(p+vec2(0,1));
 // Gradient sign reversals identify fine texture/extrema, even at low contrast.
 // Reuse these neighbors for cleanup; no extra classification render target.
 float reversal=sqrt(max(0.,max(-lum(c-west)*lum(east-c),-lum(c-south)*lum(north-c))));
 float textureMask=smoothstep(.003,.015,reversal);
 // Detect a small step between smooth regions; do not assume a codec block grid.
 if(cleanup>0.)for(int axis=0;axis<2;axis++){
  vec2 d=axis==0?vec2(1,0):vec2(0,1);
  vec3 l=axis==0?west:south,ll=at(p-2.*d),r=axis==0?east:north,rr=at(p+2.*d);
  float left=abs(lum(c-l)),right=abs(lum(r-c));
  float outerL=abs(lum(l-ll)),outerR=abs(lum(rr-r));
  float jump=max(left,right),side=min(left,right);
  float smoothSides=1.-smoothstep(.003,.025,max(max(outerL,outerR),side));
  float smallStep=smoothstep(.003,.012,jump)*(1.-smoothstep(.04,.10,jump));
  vec3 across=left>right?l:r;
  result=mix(result,(c+across)*.5,cleanup*smoothSides*smallStep*.8*(1.-textureMask));
 }
 if(deband>0.){
  vec3 avg=vec3(0);float diff=0.;
  float radius=mix(2.,8.,deband);
  for(int i=0;i<4;i++){
   if(float(i)>=debandTaps)break;
   vec2 d=i==0?vec2(1,.5):i==1?vec2(-1,-.5):i==2?vec2(.5,-1):vec2(-.5,1);
   vec3 n=at(p+floor(d*radius));avg+=n/debandTaps;
   diff=max(diff,max(max(abs(n.r-c.r),abs(n.g-c.g)),abs(n.b-c.b)));
  }
  float flatRegion=1.-smoothstep(.006,.012+deband*.04,diff);
  result=mix(result,avg,deband*flatRegion*.8*(1.-textureMask));
 }
 // On devices without float color targets, dither before this first quantization.
 if(quantize&&deband>0.)result+=(fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5)/255.;
 fragColor=vec4(clamp(result,0.,1.),1.);
}
