#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D source;
uniform vec2 outputSize;
out vec4 fragColor;
void main(){fragColor=vec4(texture(source,gl_FragCoord.xy/outputSize).rgb,1);}
