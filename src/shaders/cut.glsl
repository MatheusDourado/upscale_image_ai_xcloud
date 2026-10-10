#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D source, previous;
out vec4 fragColor;
void main(){float difference=0.;for(int y=0;y<16;y++)for(int x=0;x<16;x++){
 vec2 uv=(vec2(x,y)+.5)/16.;vec3 d=abs(texture(source,uv).rgb-texture(previous,uv).rgb);
 difference+=dot(d,vec3(.2126,.7152,.0722))/256.;
}fragColor=vec4(difference,0,0,1);}
