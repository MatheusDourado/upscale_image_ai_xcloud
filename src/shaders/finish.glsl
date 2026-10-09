#version 300 es
precision highp float;
uniform sampler2D source;
uniform vec2 outputSize;
uniform float contrast,saturation,shadows,deband;
uniform bool diagnostic;
out vec4 fragColor;
void main(){vec3 c=texture(source,gl_FragCoord.xy/outputSize).rgb;
 float l=dot(c,vec3(.2126,.7152,.0722));
 c=mix(vec3(l),c,saturation);c=(c-.5)*contrast+.5;
 c+=shadows*pow(max(0.,1.-l),3.)*.15;
 float noise=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5;
 c+=noise/255.*deband;
 if(diagnostic)c=mix(c,vec3(1,0,.75),.65);
 fragColor=vec4(clamp(c,0.,1.),1.);}
