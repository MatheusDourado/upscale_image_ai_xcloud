#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D source, history, motion;
uniform float temporal;
out vec4 fragColor;
void main(){
 vec2 size=vec2(textureSize(source,0)),uv=gl_FragCoord.xy/size;
 vec3 c=texture(source,uv).rgb,lo=c,hi=c;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  vec3 n=texture(source,uv+vec2(x,y)/size).rgb;lo=min(lo,n);hi=max(hi,n);
 }
 vec3 field=texture(motion,uv).rgb;
 vec2 offset=(round(field.xy*255.)-128.)*.5;
 vec2 prevUV=uv+offset/size;
 vec3 old=texture(history,prevUV).rgb;
 float disagreement=max(max(abs(old.r-c.r),abs(old.g-c.g)),abs(old.b-c.b));
 float confidence=field.z*(1.-smoothstep(.02,.08,disagreement));
 if(any(lessThan(prevUV,vec2(0)))||any(greaterThan(prevUV,vec2(1))))confidence=0.;
 // Neighborhood clamp prevents old edges becoming trails or invented textures.
 old=clamp(old,lo-vec3(.004),hi+vec3(.004));
 fragColor=vec4(mix(c,old,temporal*confidence*.35),1.);
}
