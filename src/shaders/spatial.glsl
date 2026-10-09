#version 300 es
precision highp float;
uniform sampler2D source;
uniform float cleanup, deband;
out vec4 fragColor;
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
vec3 at(vec2 p){return texelFetch(source,clamp(ivec2(p),ivec2(0),textureSize(source,0)-1),0).rgb;}
void main(){
 vec2 p=gl_FragCoord.xy-.5;vec3 c=at(p), result=c;
 // Detect a small step between smooth regions; do not assume a codec block grid.
 if(cleanup>0.)for(int axis=0;axis<2;axis++){
  vec2 d=axis==0?vec2(1,0):vec2(0,1);
  vec3 l=at(p-d),ll=at(p-2.*d),r=at(p+d),rr=at(p+2.*d);
  float left=abs(lum(c-l)),right=abs(lum(r-c));
  float outerL=abs(lum(l-ll)),outerR=abs(lum(rr-r));
  float jump=max(left,right),side=min(left,right);
  float smoothSides=1.-smoothstep(.003,.025,max(max(outerL,outerR),side));
  float smallStep=smoothstep(.003,.012,jump)*(1.-smoothstep(.04,.10,jump));
  vec3 across=left>right?l:r;
  result=mix(result,(c+across)*.5,cleanup*smoothSides*smallStep*.8);
 }
 if(deband>0.){
  vec3 avg=vec3(0);float diff=0.;
  float radius=mix(2.,8.,deband);
  for(int i=0;i<4;i++){
   vec2 d=i==0?vec2(1,.5):i==1?vec2(-1,-.5):i==2?vec2(.5,-1):vec2(-.5,1);
   vec3 n=at(p+floor(d*radius));avg+=n*.25;
   diff=max(diff,max(max(abs(n.r-c.r),abs(n.g-c.g)),abs(n.b-c.b)));
  }
  float flatRegion=1.-smoothstep(.006,.012+deband*.04,diff);
  result=mix(result,avg,deband*flatRegion*.8);
 }
 fragColor=vec4(clamp(result,0.,1.),1.);
}
