#version 300 es
precision highp float;
precision highp sampler2D;
// FidelityFX Super Resolution Sample
//
// Copyright (c) 2021 Advanced Micro Devices, Inc. All rights reserved.
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files(the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and / or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions :
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

// RCAS port of vendor/ffx_fsr1.h FsrRcasF, denoise enabled.
// Exact guarded reciprocals replace AMD approximations. Local halo limiter is ours.
uniform sampler2D data;
uniform vec2 outputSize;
uniform float rcasStrength,haloMargin,contrast,saturation,shadows,deband;
uniform bool diagnostic;
out vec4 fragColor;
/* FINISH_COLOR */
float luma2(vec3 c){return c.b*.5+c.r*.5+c.g;}
void main(){
 vec2 uv=gl_FragCoord.xy/outputSize,stepSize=1./vec2(textureSize(data,0));
 vec3 e=texture(data,uv).rgb,c=e;
 if(rcasStrength>0.){
  vec3 b=texture(data,uv+vec2(0,-1)*stepSize).rgb,d=texture(data,uv+vec2(-1,0)*stepSize).rgb;
  vec3 f=texture(data,uv+vec2(1,0)*stepSize).rgb,h=texture(data,uv+vec2(0,1)*stepSize).rgb;
  float bl=luma2(b),dl=luma2(d),el=luma2(e),fl=luma2(f),hl=luma2(h);
  float range=max(max(max(bl,dl),max(fl,hl)),el)-min(min(min(bl,dl),min(fl,hl)),el);
  float noise=1.-.5*clamp(abs(.25*(bl+dl+fl+hl)-el)/max(range,1e-6),0.,1.);
  vec3 mn=min(min(b,d),min(f,h)),mx=max(max(b,d),max(f,h));
  vec3 hitMin=min(mn,e)/max(4.*mx,vec3(1e-6));
  vec3 hitMax=(1.-max(mx,e))/min(4.*mn-4.,vec3(-1e-6));
  vec3 lobes=max(-hitMin,hitMax);
  float lobe=max(-.1875,min(max(max(lobes.r,lobes.g),lobes.b),0.))*rcasStrength*noise;
  c=(lobe*(b+d+f+h)+e)/(4.*lobe+1.);
  vec3 lo=min(mn,e),hi=max(mx,e);
  float detail=smoothstep(1./255.,5./255.,max(max(hi.r-lo.r,hi.g-lo.g),hi.b-lo.b));
  c=clamp(mix(e,c,detail),lo-haloMargin,hi+haloMargin);
 }
 float l=dot(c,vec3(.299,.587,.114));c=mix(vec3(l),c,saturation);c=contrast*(c-.5)+.5;
 fragColor=vec4(finishColor(c),1);
}
