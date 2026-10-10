#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D source;
uniform float cleanup, deband, debandTaps;
uniform bool quantize,selective;
out vec4 fragColor;
float peak(vec3 c){return max(max(abs(c.r),abs(c.g)),abs(c.b));}
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
 // Color extrema matter even on nearly isoluminant colored text and fine lines.
 if(selective){
  vec3 rx=max(-(c-west)*(east-c),-(c-south)*(north-c));
  textureMask=max(textureMask,smoothstep(.003,.015,sqrt(max(0.,max(max(rx.r,rx.g),rx.b)))));
 }
 // Detect a small step between smooth regions; do not assume a codec block grid.
 if(cleanup>0.)for(int axis=0;axis<2;axis++){
  vec2 d=axis==0?vec2(1,0):vec2(0,1);
  vec3 l=axis==0?west:south,ll=at(p-2.*d),r=axis==0?east:north,rr=at(p+2.*d);
  float left=selective?peak(c-l):abs(lum(c-l)),right=selective?peak(r-c):abs(lum(r-c));
  float outerL=selective?peak(l-ll):abs(lum(l-ll)),outerR=selective?peak(rr-r):abs(lum(rr-r));
  float jump=max(left,right),side=min(left,right);
  float smoothSides=1.-smoothstep(.003,.025,max(max(outerL,outerR),side));
  float smallStep=smoothstep(.003,.012,jump)*(1.-smoothstep(.04,.10,jump));
  // Reject a continuous ramp: it is not evidence of a compression boundary.
  float confidence=selective?1.-smoothstep(.2,.7,max(max(outerL,outerR),side)/max(jump,1e-5)):1.;
  vec3 across=left>right?l:r;
  result=mix(result,(c+across)*.5,cleanup*confidence*smoothSides*smallStep*.8*(1.-textureMask));
 }
 if(deband>0.){
  vec3 avg=vec3(0);float diff=0.,weightSum=0.;
  float radius=mix(2.,8.,deband);
  for(int i=0;i<4;i++){
   if(float(i)>=debandTaps)break;
   vec2 d=i==0?vec2(1,.5):i==1?vec2(-1,-.5):i==2?vec2(.5,-1):vec2(-.5,1);
   vec3 n=at(p+floor(d*radius));
   // Outlying samples across an edge cannot pull a smooth region toward it.
   float weight=selective?1.-smoothstep(.006,.012+deband*.04,peak(n-c)):1.;
   avg+=n*weight;weightSum+=weight;
   diff=max(diff,max(max(abs(n.r-c.r),abs(n.g-c.g)),abs(n.b-c.b)));
  }
  avg=weightSum>0.?avg/weightSum:c;
  float flatRegion=1.-smoothstep(.006,.012+deband*.04,diff);
  result=mix(result,avg,deband*flatRegion*.8*(1.-textureMask));
 }
 // On devices without float color targets, dither before this first quantization.
 if(quantize&&deband>0.)result+=(fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5)/255.;
 fragColor=vec4(clamp(result,0.,1.),1.);
}
