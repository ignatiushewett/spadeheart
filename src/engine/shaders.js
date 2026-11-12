// GLSL sources. LIGHTING is shared by every lit surface so the world, zombies and debris
// all sit in the same atmosphere.
export const MAX_LIGHTS = 16;
export const MAX_SPOTS = 4;

const COMMON = /* glsl */`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler2DArrayShadow;
`;

const FRAME_UNIFORMS = /* glsl */`
uniform mat4 uViewProj;
uniform vec3 uCam;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSkyCol;
uniform vec3 uHorizon;
uniform vec3 uGroundCol;
uniform vec3 uFogCol;
uniform float uFogDensity;
uniform float uTime;
uniform float uWet;
uniform float uRainNow;
uniform float uRunTime;
uniform vec4 uCrackPts[16];   // where glass was last broken: xyz, and a seed for its pattern (w < 0: unused)
`;

const LIGHTING = /* glsl */`
uniform sampler2DArrayShadow uShadow;
uniform mat4 uShadowMat[3];
uniform vec3 uShadowRange;
uniform int uShadowOn;
uniform int uLightCount;
uniform vec4 uLightPos[${MAX_LIGHTS}];
uniform vec3 uLightCol[${MAX_LIGHTS}];
uniform vec4 uSpotPos;
uniform vec3 uSpotDir;
uniform int uSpotN;             // torches other people are carrying
uniform vec4 uSpots[${MAX_SPOTS}];
uniform vec4 uSpotDirs[${MAX_SPOTS}];
uniform vec3 uSpotCols[${MAX_SPOTS}];
uniform vec4 uFlood;            // the statue's floodlights: x, aim height, z, strength
uniform vec4 uFloodLamp[4];     // each lamp: where it is, and how strong
uniform sampler2D uCityLight;   // every lamp and fire in the world, painted into one map
uniform float uCityLightK;
const vec2 WSIZE=vec2(5216.,4096.);

float hash12(vec2 p){ vec3 q=fract(vec3(p.xyx)*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
float vnoise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),f.x),mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),f.x),f.y); }
vec3 cityGlow(vec3 wp){
  vec3 L=texture(uCityLight,wp.xz/WSIZE).rgb;
  if(L.r+L.g<.004) return vec3(0.);
  // Light pools at ground level and is gone a few storeys up. Fires breathe a little.
  float h=clamp(1.-(wp.y-12.)/34.,0.,1.);
  float fl=.92+.08*sin(uTime*7.+wp.x*.3+wp.z*.2)*sin(uTime*11.3+wp.z*.4);
  return L*L*5.5*h*h*fl;
}
vec3 cityLight(vec3 wp){ return cityGlow(wp)*uCityLightK; }

float shadowCascade(int c, vec3 wp, vec3 n){
  float ndl=clamp(dot(n,uSunDir),0.,1.);
  float bias=(c==0?.05:(c==1?.14:.7))*(1.2-ndl);
  vec4 sc=uShadowMat[c]*vec4(wp+n*bias,1.);
  vec3 p=sc.xyz*.5+.5;
  if(p.x<0.||p.y<0.||p.x>1.||p.y>1.||p.z>1.) return 1.0;
  float texel=1./float(textureSize(uShadow,0).x);
  float s=0.;
  float zb=p.z-.0002;
  float spread=c==0?1.2:1.0;
  s+=texture(uShadow,vec4(p.xy+vec2(-.7,-.3)*texel*spread,float(c),zb));
  s+=texture(uShadow,vec4(p.xy+vec2(.3,-.7)*texel*spread,float(c),zb));
  s+=texture(uShadow,vec4(p.xy+vec2(.7,.3)*texel*spread,float(c),zb));
  s+=texture(uShadow,vec4(p.xy+vec2(-.3,.7)*texel*spread,float(c),zb));
  return s*.25;
}

float sampleShadow(vec3 wp, vec3 n, float dist){
  if(uShadowOn==0) return 1.0;
  if(dist>uShadowRange.z) return 1.0;
  int c = dist<uShadowRange.x?0:(dist<uShadowRange.y?1:2);
  float k=shadowCascade(c,wp,n);
  // Each cascade hands over to the next across a wide band, not at a line: otherwise the edge of the sharp one is a circle round you that
  // sweeps over every wall you walk towards, as one map's idea of what is lit gives way to the other's.
  float edge=c==0?uShadowRange.x:uShadowRange.y, band=edge*.35;
  if(c<2&&dist>edge-band&&!(c==1&&uShadowRange.y>=uShadowRange.z)) k=mix(k,shadowCascade(c+1,wp,n),smoothstep(edge-band,edge,dist));
  // Fade the last cascade out instead of cutting it.
  float fade=smoothstep(uShadowRange.z*.8,uShadowRange.z,dist);
  return mix(k,1.,fade);
}

// Lit from below, the way a monument is: undersides and faces catch it, tops stay dark, and it thins out as it climbs towards the crown.
vec3 floodLit(vec3 wp, vec3 n){
  if(uFlood.w<=0.) return vec3(0.);
  vec2 q=wp.xz-uFlood.xz;
  if(dot(q,q)>1936.) return vec3(0.);
  vec3 sum=vec3(0.),aim=vec3(uFlood.x,uFlood.y,uFlood.z);
  for(int i=0;i<4;i++){
    vec3 d=wp-uFloodLamp[i].xyz;
    float l=length(d);
    vec3 v=d/max(l,.001);
    float cone=smoothstep(.7,.93,dot(v,normalize(aim-uFloodLamp[i].xyz)));
    sum+=vec3(1.,.95,.86)*uFloodLamp[i].w*cone*max(dot(n,-v)*.86+.14,0.)/(1.+l*l*.00045);
    // And a little pool on the ground round the lamp itself.
    float pool=max(1.-l/8.,0.);
    sum+=vec3(1.,.95,.86)*.16*pool*pool*max(n.y,.2);
  }
  // Up where the floods give out, her own flame takes over: warm on the crown and the raised arm, against the cold of the harbour.
  vec3 toFlame=vec3(uFlood.x+5.,uFlood.y+36.,uFlood.z)-wp;
  float fl=length(toFlame),fa=max(1.-fl/30.,0.);
  sum+=vec3(1.,.56,.2)*.75*fa*fa*max(dot(n,toFlame/max(fl,.001))*.8+.2,0.)*(.9+.1*sin(uTime*7.)*sin(uTime*11.3));
  // A little of it comes back off the stone at her feet, warmer, so the undersides are never quite black.
  sum+=vec3(1.,.9,.74)*.05*smoothstep(44.,10.,length(q))*smoothstep(70.,20.,wp.y);
  return sum*uFlood.w*2.6;
}

// Rain on a window: beads that come and go, and every so often one lets go and runs down, leaving its track behind it.
float rainOnGlass(vec3 wp, vec3 n, float beadK){
  if(uWet<.01||abs(n.y)>.5) return 0.;
  vec2 p=vec2(abs(n.x)>.5?wp.z:wp.x,wp.y);
  float u=p.x*7.,cell=floor(u),fx=fract(u)-.5;
  float r1=hash12(vec2(cell,3.1)),r2=hash12(vec2(cell,7.7));
  float on=step(r1,.2+uRainNow*.55);
  float s=fract(p.y*.32+uRunTime*(.16+.28*r2)+r2*5.);
  float wob=sin(p.y*5.+r1*20.)*.07;
  float line=smoothstep(.09,.025,abs(fx+wob));
  float run=on*line*(exp(-s*28.)*1.3+exp(-s*3.2)*.32);
  vec2 q=p*vec2(11.,9.),id=floor(q),f=fract(q)-.5;
  id+=floor(uTime*.12+hash12(id)*9.)*vec2(17.,31.);
  float hb=hash12(id+17.);
  vec2 o=(vec2(hash12(id+3.),hash12(id+9.))-.5)*.5;
  float bead=step(hb,(.09*uWet+.07*uRainNow)*mix(1.,1.8,beadK))*smoothstep(mix(.15,.22,beadK),mix(.04,.08,beadK),length(f-o))*mix(.45+.4*hash12(id+5.),1.,beadK);
  return clamp((run+bead)*min(1.,uRainNow*2.2+uWet*.18),0.,1.);
}

vec3 dynLights(vec3 wp, vec3 n){
  vec3 sum=cityLight(wp)*(.55+.45*max(n.y,0.))+floodLit(wp,n);
  for(int i=0;i<uLightCount;i++){
    vec3 d=uLightPos[i].xyz-wp;
    float r=uLightPos[i].w;
    float l2=dot(d,d);
    if(l2>r*r) continue;
    float l=sqrt(l2);
    float a=1.-l/r; a*=a;
    float nd=max(dot(n,d/l)*.85+.15,0.);
    sum+=uLightCol[i]*a*nd;
  }
  if(uSpotPos.w>0.){
    vec3 d=wp-uSpotPos.xyz;
    float l=length(d);
    vec3 v=d/max(l,.001);
    float c=dot(v,uSpotDir);
    // A bright centre and a wide, weak spill, like a real torch, in place of one flat disc.
    float cone=smoothstep(.82,.93,c)*.2+smoothstep(.925,.992,c)*.95;
    float att=1./(1.+l*l*.02);
    // Wrapped, so the road at your feet catches the light it would lose to the shallow angle.
    float nd=max(dot(n,-v)*.72+.28,0.);
    sum+=vec3(1.,.95,.86)*uSpotPos.w*cone*att*nd*smoothstep(58.,18.,l);
  }
  for(int i=0;i<uSpotN;i++){
    vec3 d=wp-uSpots[i].xyz;
    float l=length(d),range=uSpotDirs[i].w;
    if(l>range+3.) continue;
    vec3 v=d/max(l,.001);
    float c=dot(v,uSpotDirs[i].xyz);
    float cone=smoothstep(.86,.94,c)*.3+smoothstep(.94,.993,c);
    if(cone<=0.) continue;
    // It stops at whatever the beam landed on, instead of lighting up the room behind.
    sum+=uSpotCols[i]*uSpots[i].w*cone*max(dot(n,-v)*.72+.28,0.)/(1.+l*l*.014)*smoothstep(range+3.,range,l);
  }
  return sum;
}

// Wet ground throws back every light in reach, broken up by the rain landing in it. n is already roughened.
vec3 wetGlare(vec3 wp, vec3 n, vec3 v, float glint){
  vec3 sum=vec3(0.);
  for(int i=0;i<uLightCount;i++){
    vec3 d=uLightPos[i].xyz-wp;
    float r=uLightPos[i].w;
    float l=length(d);
    if(l>r) continue;
    vec3 h=normalize(d/l+v);
    sum+=uLightCol[i]*pow(max(dot(n,h),0.),48.)*(1.-l/r)*.9;
  }
  for(int i=0;i<uSpotN;i++){
    vec3 d=uSpots[i].xyz-wp;
    float l=length(d);
    if(l>uSpotDirs[i].w+3.) continue;
    vec3 L=d/max(l,.001);
    float c=-dot(L,uSpotDirs[i].xyz);
    sum+=uSpotCols[i]*uSpots[i].w*pow(max(dot(n,normalize(L+v)),0.),36.)*smoothstep(.86,.97,c)*.45;
  }
  if(uSpotPos.w>0.){
    vec3 d=wp-uSpotPos.xyz;
    float l=length(d);
    float c=dot(d/max(l,.001),uSpotDir);
    float cone=smoothstep(.84,.97,c)/(1.+l*l*.018)*smoothstep(52.,16.,l);
    // Your own light mostly skids away along the road. What comes back is a sheen, and a scatter of bright glints off the ripples.
    sum+=vec3(1.,.97,.9)*uSpotPos.w*cone*(.11+glint*.5);
  }
  return sum;
}

// Fog lies in the streets and thins with height. This is the exact amount along the whole line of
// sight, not a guess from where the ray ends, so it stays the same whichever way you look.
vec3 applyFog(vec3 col, vec3 wp){
  vec3 v=wp-uCam;
  float d=length(v);
  vec3 dir=v/max(d,.001);
  const float K=.016;
  float x=K*dir.y*d;
  float path=abs(x)<.002?1.-x*.5:(1.-exp(-x))/x;
  float low=exp(-K*max(uCam.y-12.,-4.));
  // High ground stands clear of the haze: the top of a mountain shows from the far side of the state.
  float clearK=mix(1.,.22,smoothstep(40.,170.,wp.y));
  float amt=1.-exp(-uFogDensity*d*(.24*clearK+.76*low*path));
  float sunAmt=pow(max(dot(dir,uSunDir),0.),6.);
  vec3 fog=uFogCol+uSunCol*sunAmt*.05;
  // Lamp-light hangs in the air over the camps. From a distance it is the only thing you can see.
  fog+=texture(uCityLight,wp.xz/WSIZE).rgb*vec3(.5,.33,.2)*.22*uCityLightK;
  return mix(col,fog,amt);
}

vec3 shade(vec3 albedo, vec3 wp, vec3 n, float sky, float ao, float dist){
  float ndl=max(dot(n,uSunDir),0.);
  float sh=ndl>0.?sampleShadow(wp,n,dist):0.;
  vec3 amb=mix(uGroundCol,uSkyCol,n.y*.5+.5)*mix(.1,1.,sky);
  // Fill so interiors are dark but still readable.
  amb+=vec3(.008,.009,.011)*(1.-uCityLightK*.9);
  vec3 c=albedo*(amb*ao+uSunCol*ndl*sh*mix(.25,1.,sky));
  c+=albedo*dynLights(wp,n);
  // Daylight drowns a lamp outdoors. Under a roof it still does its job.
  c+=albedo*cityGlow(wp)*(1.-uCityLightK)*(1.-sky)*1.6*(.55+.45*max(n.y,0.));
  return c;
}
`;

// --- Voxel chunks -----------------------------------------------------------------
export const CHUNK_VS = COMMON + FRAME_UNIFORMS + /* glsl */`
layout(location=0) in uvec4 aPos;
layout(location=1) in uvec4 aInfo;
uniform vec3 uOrigin;
uniform sampler2D uPalette;
uniform float uSway;
uniform float uGrassT;
out vec3 vWorld;
out vec3 vNormal;
out float vAO;
out float vSky;
flat out int vId;
const vec3 NORMALS[6]=vec3[6](vec3(1,0,0),vec3(-1,0,0),vec3(0,1,0),vec3(0,-1,0),vec3(0,0,1),vec3(0,0,-1));
void main(){
  vec3 p=vec3(aPos.xyz)+uOrigin;
  // Leaves and standing crops move in the air: each corner on its own slow loop, worked out from where it is, so faces that share a
  // corner move together and nothing opens up between them. Harder in a wind.
  int flags=int(texelFetch(uPalette,ivec2(int(aInfo.x),0),0).a*255.+.5);
  if((flags&8)!=0&&uSway>0.){
    float t=uTime,k=uSway;
    p.x+=(sin(t*.85+p.x*.31+p.y*.19+p.z*.13)*.65+sin(t*1.45+p.z*.53)*.35)*.13*k;
    p.z+=(cos(t*.7+p.z*.29+p.y*.23+p.x*.11)*.65+sin(t*1.6+p.x*.47)*.35)*.13*k;
    p.y+=sin(t*1.05+p.x*.4+p.z*.4)*.035*k;
  }
  // Grass in the wind: the top edge of each grass block lifted up to a third of a block and let down again, in long waves running
  // across the ground on the diagonal. Only what is drawn moves; nothing anyone stands on or bumps into does.
  if(aInfo.w>0u){
    float ph=uGrassT*.9-(p.x+p.z)*.075;
    p.y+=(.5+.5*sin(ph))*.333;
  }
  vWorld=p;
  vNormal=NORMALS[aPos.w];
  vAO=float(aInfo.y);
  vSky=float(aInfo.z)/255.;
  vId=int(aInfo.x);
  gl_Position=uViewProj*vec4(p,1.);
}`;

export const CHUNK_FS = COMMON + FRAME_UNIFORMS + LIGHTING + /* glsl */`
in vec3 vWorld;
in vec3 vNormal;
in float vAO;
in float vSky;
flat in int vId;
uniform sampler2D uPalette;
uniform int uGlassPass;
uniform float uNightGlow;
uniform sampler2D uRainMap;
uniform vec3 uRainMapO;
uniform sampler2D uBlood;
uniform vec3 uBloodO;
layout(location=0) out vec4 outCol;
const float AO_CURVE[4]=float[4](.42,.62,.82,1.);
// Is the air on this side of the face out under the sky? The rain map knows, near the camera. Further off, the face's own sky light will do.
float underSky(vec3 p,float fallback){
  if(uRainMapO.z<=0.) return fallback;
  vec2 m=(p.xz-uRainMapO.xy)/uRainMapO.z;
  if(any(lessThan(m,vec2(0.)))||any(greaterThanEqual(m,vec2(1.)))) return fallback;
  return p.y>=textureLod(uRainMap,m,0.).r*255.+1.?1.:0.;
}
// The outside of a pane: the side that is out in the weather. Walk straight out from each side and see which reaches open sky first.
// A cornice, a fire escape or an awning over the pavement is a step or two from the street; a room is the whole depth of the building.
float skyDist(vec3 p,vec3 dir){
  for(int i=0;i<8;i++){
    vec3 q=p+dir*(float(i)+.5);
    vec2 m=(q.xz-uRainMapO.xy)/uRainMapO.z;
    if(any(lessThan(m,vec2(0.)))||any(greaterThanEqual(m,vec2(1.)))) return -1.;
    if(q.y>=textureLod(uRainMap,m,0.).r*255.+1.) return float(i);
  }
  return 8.;
}
float paneOutside(vec3 face,vec3 n,float fallback){
  if(uRainMapO.z<=0.) return fallback;
  float df=skyDist(face,n),db=skyDist(face-n,-n);
  if(df<0.||db<0.) return fallback;
  if(df>=8.&&db>=8.) return fallback;
  return df<db?1.:0.;
}
// A wall is out in the weather if the street is right in front of it. A ledge or a cornice overhead does not keep it dry: the rain still
// blows in under a step or two of cover. A room is deeper than that, and a wall in one reaches the sky sooner through its back.
float wallOutside(vec3 face,vec3 n,float fallback){
  if(uRainMapO.z<=0.) return fallback;
  float df=skyDist(face,n);
  if(df<0.) return fallback;
  if(df>2.) return 0.;
  float db=skyDist(face-n,-n);
  if(db<0.) return fallback;
  return df<db?1.:0.;
}
// Ground under cover, but only just: a lamp arm, a sign, the lip of an awning, a doorway. Rain blows a block or two in under that,
// through open space only. A wall stops it, so a room behind one stays dry however close to the street it is.
vec3 rainCol(vec2 c){
  vec2 m=(c+.5-uRainMapO.xy)/uRainMapO.z;
  if(any(lessThan(m,vec2(0.)))||any(greaterThanEqual(m,vec2(1.)))) return vec3(-1.);
  return textureLod(uRainMap,m,0.).rgb*255.;
}
bool openAt(vec3 t,float y){ return t.x>=0.&&y>=t.x+1.; }
bool passAt(vec3 t,float y){ return t.x>=0.&&(y>=t.x+1.||(y>t.z+1.&&y<t.y+1.)); }
float blowIn(vec3 p){
  if(uRainMapO.z<=0.) return 0.;
  vec2 c=floor(p.xz);
  float y=p.y,best=0.;
  for(int k=0;k<4;k++){
    vec2 d=k==0?vec2(1,0):k==1?vec2(-1,0):k==2?vec2(0,1):vec2(0,-1);
    vec3 t1=rainCol(c+d);
    if(openAt(t1,y)) return 1.;
    if(passAt(t1,y)&&openAt(rainCol(c+d*2.),y)) best=max(best,.5);
  }
  for(int k=0;k<4;k++){
    vec2 d=vec2(k<2?1.:-1.,(k&1)==0?1.:-1.);
    if(!passAt(rainCol(c+vec2(d.x,0.)),y)&&!passAt(rainCol(c+vec2(0.,d.y)),y)) continue;
    if(openAt(rainCol(c+d),y)) best=max(best,.75);
  }
  return best;
}
void main(){
  vec4 pal=texelFetch(uPalette,ivec2(vId,0),0);
  int flags=int(pal.a*255.+.5);
  vec3 col=pow(pal.rgb,vec3(2.2));
  vec3 n=vNormal;
  float dist=length(vWorld-uCam);
  // Per-voxel tone variation gives the surfaces their texture.
  vec3 vp=floor(vWorld-n*.5+.001);
  float hv=hash12(vp.xz+vp.y*17.3);
  float hb=hash12(floor(vp.xz/4.)+floor(vp.y/3.)*7.1);
  col*=.86+.2*hv+.08*hb;
  // Weather: big slow stains, rain streaks down the walls, and grime rising from the street.
  vec2 wc=abs(n.x)>.5?vec2(vp.z,vp.y):(abs(n.z)>.5?vec2(vp.x,vp.y):vp.xz);
  float stain=vnoise(wc/11.)*.6+vnoise(wc/3.7)*.4;
  col*=mix(.66,1.1,stain);
  if(abs(n.y)<.5){
    float streak=vnoise(vec2(wc.x/1.7,wc.y/15.));
    col*=mix(.76,1.04,streak);
    col*=vec3(.94,.96,.9);
  }
  float low=smoothstep(26.,12.,vWorld.y);
  col*=mix(1.,.84,low);
  col=mix(col,col*vec3(.92,.95,.8),low*.4);
  if((flags&1)!=0){
    outCol=vec4(col*(1.5+uNightGlow*3.),1.);
    outCol.rgb=applyFog(outCol.rgb,vWorld);
    return;
  }
  float aoi=clamp(vAO,0.,3.);
  float ao=mix(AO_CURVE[int(floor(aoi))],AO_CURVE[min(3,int(floor(aoi))+1)],fract(aoi));
  if((flags&2)!=0){
    // From indoors you see the outside face of the pane from behind, through the glass. Only the water on it is drawn from this side, and only if that face is the one out in the weather.
    if(!gl_FrontFacing){
      float wb=uGlassPass==1?rainOnGlass(vWorld,n,1.)*smoothstep(80.,20.,dist)*paneOutside(vWorld,n,smoothstep(.25,.55,vSky)):0.;
      if(wb<.01) discard;
      vec3 dc=(uHorizon*.55+uSkyCol*.45)*(1.-.75*clamp(uNightGlow,0.,1.))+cityLight(vWorld)*.7+vec3(.012);
      outCol=vec4(applyFog(dc,vWorld),wb*.58);
      return;
    }
    // Cracked glass: fracture lines running out from where it was hit, straight and kinked, with a broken ring or two round the hole.
    // Clear glass between them. Glass broken before the last few hits gets a small star of its own in each pane block.
    float crk=0.;
    if((flags&16)!=0){
      // Drawn on a grid of fourteen to a block, so the cracks are as blocky as everything else.
      vec2 fp=abs(n.x)>.5?vWorld.zy:abs(n.z)>.5?vWorld.xy:vWorld.xz;
      fp=(floor(fp*14.)+.5)/14.;
      vec3 best=vec3(0.); float bd=1e9, seed=0.;
      for(int i=0;i<16;i++){
        vec4 c4=uCrackPts[i];
        if(c4.w<0.) continue;
        if(abs(dot(vWorld-c4.xyz,n))>1.2) continue;
        float d=distance(vWorld,c4.xyz);
        if(d<bd){ bd=d; best=c4.xyz; seed=c4.w; }
      }
      vec2 ctr;
      float reach;
      if(bd<4.){ ctr=abs(n.x)>.5?best.zy:abs(n.z)>.5?best.xy:best.xz; reach=3.2; }
      else {
        // Cracked long ago, nobody knows where from: one break to every few blocks of glass, so a pane reads as one cracked window.
        vec2 cell=floor(fp/3.); seed=hash12(cell+vec2(dot(n,vec3(7.,13.,19.))))*50.;
        ctr=cell*3.+.9+1.2*vec2(hash12(cell+3.1),hash12(cell+5.7)); reach=2.3;
      }
      vec2 d=fp-ctr;
      float r=length(d), ang=atan(d.y,d.x);
      // A dozen spokes, each at its own angle in its own sector, kinking a little as they go and stopping at their own length.
      float k=ang/6.2832*12.+seed;
      float si=floor(k), sf=fract(k);
      float kink=(hash12(vec2(si,floor(r*2.6)+seed))-.5)*.16;
      float along=abs(sf-(.2+.6*hash12(vec2(si,seed)))-kink)*(6.2832/12.)*r;
      float len=reach*(.45+.55*hash12(vec2(si,seed+3.)));
      crk=(1.-step(.036,along))*step(.04,r)*(1.-step(len,r));
      // Rings: two or three broken arcs, close in round the hole.
      for(int j=0;j<3;j++){
        float rr=(.22+float(j)*.38+hash12(vec2(seed,float(j)))*.16)*reach/3.2*2.4;
        float rd=abs(r-rr-(hash12(vec2(si,float(j)+seed))-.5)*.05);
        float keep=step(.4,hash12(vec2(si*3.+float(j),seed+1.)));
        crk=max(crk,(1.-step(.036,rd))*keep);
      }
      crk*=smoothstep(.0,.04,1.-r/(reach*1.2));
      // Lines this fine only fizz at a distance. They come in as you get near.
      crk*=bd<4.?smoothstep(90.,30.,dist):smoothstep(45.,14.,dist);
    }
    // Glass: fresnel sky reflection plus a hot sun glint.
    vec3 v=normalize(uCam-vWorld);
    float f=pow(1.-max(dot(n,v),0.),3.);
    vec3 r=reflect(-v,n);
    vec3 skyR=mix(uHorizon,uSkyCol*1.1,clamp(r.y*1.4+.15,0.,1.));
    float sun=pow(max(dot(r,uSunDir),0.),220.);
    float lit=sampleShadow(vWorld,n,dist);
    // There is nothing to reflect at night but a very dark sky, and glass has no colour of its own in the dark. It used to glow blue.
    float dark=clamp(uNightGlow,0.,1.);
    skyR=mix(skyR,vec3(dot(skyR,vec3(.3,.5,.2))),dark*.8)*mix(1.,.3,dark);
    vec3 c=mix(col*.42*mix(1.,.05,dark),skyR,.28+.72*f)+uSunCol*sun*7.*lit;
    c=shade(col*.2,vWorld,n,vSky,ao,dist)+c*(.25+.75*vSky);
    // Water on the pane catches whatever light there is, and you see it from either side of the glass.
    float wet=rainOnGlass(vWorld,n,1.)*smoothstep(80.,20.,dist)*paneOutside(vWorld,n,smoothstep(.25,.55,vSky));
    c=mix(c,c*.7+skyR*.75+cityLight(vWorld)*.7+uSunCol*.06*lit+vec3(.012),wet*.58);
    // After dark a pane still shows: a dull sheen of the night, and whatever lamp is near it caught in the glass.
    float near=smoothstep(45.,14.,dist);
    c+=(vec3(.012,.014,.018)+dynLights(vWorld,n)*.16)*dark*(.5+.5*f)*near;
    // Close to, cracked glass is clearer and bluer than a whole pane. Further off it is just more of the building's glass, so a broken
    // window across the street does not stand out from every whole one round it.
    float ck=(flags&16)!=0?smoothstep(70.,25.,dist):0.;
    if((flags&16)!=0){
      // Only the cracks show it: they catch the light in a cold blue. The glass between them is the same glass it always was.
      vec3 edge=(mix(uHorizon,uSkyCol,.5)*.9*(1.-.8*dark)+cityLight(vWorld)*.5+dynLights(vWorld,n)*.15+uSunCol*.1*lit+vec3(.012))*vec3(.55,.8,1.25);
      c=mix(c,edge*1.4,crk*.6*mix(.25,1.,ck));
    }
    float alpha=uGlassPass==1?clamp(mix(.38,.5,near)+f*mix(.5,.45,near)+wet*.22+crk*.2*ck,0.,1.):1.;
    outCol=vec4(applyFog(c,vWorld),alpha);
    return;
  }
  // Rain: walls darken where it runs, and the ground goes dark and glossy, puddled in its low spots.
  float wetUp=0.,wetSide=0.;
  float outside=0.;
  if(uWet>.003&&vSky>.04){
    float fb=smoothstep(.25,.5,vSky);
    outside=underSky(vWorld+n*.5,fb);
    if(outside<.5&&abs(n.y)<.5) outside=wallOutside(vWorld,n,fb);
    else if(outside<.5&&n.y>.5) outside=blowIn(vWorld+n*.5);
  }
  if(outside>0.){
    if(n.y>.5){
      // Tops of things: the street, roofs, tarps, crates. Dark and glossy, pooling in the low spots.
      float pud=smoothstep(.36,.62,vnoise(vp.xz/6.)*.65+vnoise(vp.xz/1.9)*.35);
      wetUp=uWet*mix(.6,1.,pud)*outside;
      col*=mix(1.,.58,wetUp);
    } else if(abs(n.y)<.5){
      // Walls and the sides of things: soaked dark, darker still in the runs where water comes down them.
      float runs=vnoise(vec2(wc.x*1.6,wc.y*.11))*.7+vnoise(vec2(wc.x*4.3,wc.y*.3))*.3;
      wetSide=uWet*outside*(.65+.35*smoothstep(.35,.7,runs));
      col*=mix(1.,.62,wetSide);
    }
  }
  // Blood on the ground: pink spots where one went down, a dark red mess where a crowd did. In blotches, not squares, and running a
  // little way up the foot of a wall beside it.
  float bloodGloss=0.,bloodK=0.;
  vec3 bloodSpec=vec3(0.);
  if(uBloodO.z>0.&&dist<140.&&n.y>-.5){
    vec3 bp=vWorld-n*.02;
    if(n.y<.5) bp+=n*.5;
    vec2 m=floor(bp.xz)-uBloodO.xy;
    if(all(greaterThanEqual(m,vec2(1.)))&&all(lessThan(m,vec2(uBloodO.z-1.)))){
      vec2 bt=texelFetch(uBlood,ivec2(m),0).rg;
      float surf=bt.g*255.;
      // Blended between neighbouring blocks on the same surface, so a stain runs on across the joins instead of stopping at them.
      vec2 fp=bp.xz-uBloodO.xy-.5; ivec2 i0=ivec2(floor(fp)); vec2 fr=fract(fp);
      float acc=0.;
      for(int k=0;k<4;k++){
        ivec2 o=ivec2(k&1,k>>1);
        vec2 t=texelFetch(uBlood,i0+o,0).rg;
        float w=(o.x==1?fr.x:1.-fr.x)*(o.y==1?fr.y:1.-fr.y);
        acc+=w*(abs(t.g*255.-surf)<.5?t.r:bt.r);
      }
      float amt=acc*1.6;
      float h=vWorld.y-surf;
      float on=n.y>.5?step(abs(h),.05):(1.-smoothstep(0.,.9,h))*step(-.05,h)*.7;
      if(amt>.003&&on>0.){
        float blot=vnoise(vWorld.xz*2.3+vWorld.y*.7)*.6+vnoise(vWorld.xz*6.1)*.4;
        // Soft at the edge: a little is a thin, wide-edged smear you can see the ground through; a lot is a solid, sharp-edged pool.
        float heavy=smoothstep(.05,.9,amt), wid=mix(.85,.3,heavy), lo=1.-min(1.,amt*1.7);
        float cover=smoothstep(lo,lo+wid,blot+.2)*on*smoothstep(0.,.35,amt);
        // Deep red going on black, never pink: what is under it is darkened and stained, and a crowd's worth is nearly black.
        vec3 fresh=vec3(.30,.012,.008), old=vec3(.075,.002,.002);
        vec3 tint=mix(fresh,old,smoothstep(.25,1.2,amt));
        vec3 stained=min(col,tint*(.55+.9*dot(col,vec3(.3,.5,.2))))*mix(vec3(1.),vec3(1.,.55,.5),heavy);
        col=mix(col,mix(stained,tint,.45+.4*heavy),cover*mix(.35,1.,heavy));
        // Wet: a sharp, bright sheen on it that grows with how much is there.
        bloodGloss=cover*mix(.35,.9,smoothstep(.1,1.,amt))*(n.y>.5?1.:.45);
        bloodK=cover*mix(.55,1.,heavy);
      }
    }
  }
  vec3 c=shade(col,vWorld,n,vSky,ao,dist);
  if(bloodGloss>0.){
    vec3 v=normalize(uCam-vWorld);
    float f=pow(1.-max(v.y,0.),3.);
    vec3 r=reflect(-v,n);
    // Mostly a mirror with a dark red body under it: sky in the reflection only at a glancing angle, and a tight hot highlight.
    float sd=max(dot(r,uSunDir),0.);
    c*=1.-.25*bloodGloss;
    c+=mix(uHorizon,uSkyCol,clamp(r.y,0.,1.))*(.04+.96*f)*.38*vec3(.85,.5,.48)*bloodGloss;
    c+=cityLight(vWorld)*(.06+f)*bloodGloss*.45*vec3(1.,.6,.55);
    // The highlight itself is the one thing allowed to be white; it goes on after the colour is kept red, below.
    bloodSpec=uSunCol*(pow(sd,160.)*1.4+pow(sd,28.)*.12)*bloodGloss;
  }
  if(wetSide>0.){
    // A wet wall has a sheen at a glancing look, and while it is coming down, water running in threads down the face of it.
    vec3 v=normalize(uCam-vWorld);
    float f=pow(1.-max(dot(n,v),0.),4.);
    vec3 env=mix(uHorizon,uSkyCol,.5)*.6+cityLight(vWorld)*.5;
    c+=env*f*wetSide*.4;
    float run=rainOnGlass(vWorld,n,.45)*uRainNow*smoothstep(70.,15.,dist);
    c+=(env+vec3(.012))*run*wetSide*.42;
  }
  if(wetUp>0.){
    vec3 v=normalize(uCam-vWorld);
    float f=pow(1.-max(v.y,0.),3.);
    vec3 r=reflect(-v,n);
    c+=(mix(uHorizon,uSkyCol,clamp(r.y,0.,1.))*(.12+.88*f)*.72+uSunCol*pow(max(dot(r,uSunDir),0.),60.)*.7)*wetUp;
    c+=cityLight(vWorld)*(.15+f)*wetUp*.62;
    // Rain landing in it: the surface is never quite flat, and never the same way twice.
    vec2 wob=vec2(vnoise(vWorld.xz*2.3+uTime*1.7),vnoise(vWorld.zx*2.9-uTime*1.9))-.5;
    vec3 rn=normalize(n+vec3(wob.x,0.,wob.y)*(.05+uRainNow*.17));
    // Raindrops landing in it: each one flashes and fades, rather than blinking on and off. Few in a drizzle, more in a downpour.
    float dens=mix(.004,.017,smoothstep(.2,.85,uRainNow));
    vec2 cell=floor(vWorld.xz*14.);
    float rate=3.+hash12(cell)*3.,ph=uTime*rate+hash12(cell.yx)*9.;
    float fade=1.-fract(ph);
    float hit=step(1.-dens,hash12(cell+floor(ph)))*fade*fade*smoothstep(.03,.2,uRainNow);
    c+=wetGlare(vWorld,rn,v,hit*.5)*wetUp*(.5+.5*f);
    // The same drops show everywhere, not only in a torch beam: each one catches the sky and whatever lamps are near.
    c+=(uSkyCol*.9+uHorizon*.35+cityLight(vWorld)*.75+vec3(.02,.022,.026))*hit*wetUp*.28;
    // And now and then the ripple a drop sends out: a faint square ring of the same little pixels, a row or three out from where it
    // landed, gone almost as soon as it is there. Only some drops, only close by, and only in proper rain. Felt more than seen.
    if(dist<26.&&uRainNow>.15){
      vec2 pc=floor(vWorld.xz*14.), zone=floor(pc/7.);
      float dens2=mix(.04,.16,smoothstep(.35,.95,uRainNow)), ring=0.;
      for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
        vec2 z=zone+vec2(float(i),float(j));
        float ph2=uTime*(1.6+hash12(z*1.7)*.9)+hash12(z.yx+3.1)*7.;
        float k=floor(ph2), a=fract(ph2);
        if(hash12(z+k*1.31)>dens2) continue;
        vec2 c0=z*7.+floor(vec2(hash12(z+k*.37),hash12(z.yx+k*.71))*7.);
        vec2 d=abs(pc-c0);
        float cheb=max(d.x,d.y), r=floor(a*3.)+1.;
        float row=abs(cheb-r)<.5?1.:abs(cheb-(r-1.))<.5&&r>1.?.3:0.;
        ring+=row*pow(1.-a,3.);
      }
      ring=min(ring,1.)*smoothstep(26.,8.,dist)*smoothstep(.15,.5,uRainNow);
      c+=wetGlare(vWorld,rn,v,ring*.06)*wetUp*(.5+.5*f);
      c+=(uSkyCol*.9+uHorizon*.35+cityLight(vWorld)*.75)*ring*wetUp*.045;
    }
  }
  if(bloodK>0.){
    // However it is lit, by lamps, torches or the sky in a wet street, blood stays a deep red: light makes it brighter, never pink.
    float rr=c.r;
    vec3 red=vec3(rr,min(c.g,rr*.2),min(c.b,rr*.17))*min(1.,.5/max(rr,.001));
    c=mix(c,red,bloodK)+bloodSpec;
  }
  outCol=vec4(applyFog(c,vWorld),1.);
}`;

export const SHADOW_VS = COMMON + /* glsl */`
layout(location=0) in uvec4 aPos;
uniform mat4 uMat;
uniform vec3 uOrigin;
void main(){ gl_Position=uMat*vec4(vec3(aPos.xyz)+uOrigin,1.); }`;

export const SHADOW_FS = COMMON + `void main(){}`;

export const FAR_SHADOW_VS = COMMON + /* glsl */`
layout(location=0) in vec3 aPos;
uniform mat4 uMat;
void main(){ gl_Position=uMat*vec4(aPos,1.); }`;

// --- Far city -----------------------------------------------------------------------
export const FAR_VS = COMMON + FRAME_UNIFORMS + /* glsl */`
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec4 aColor;
out vec3 vWorld;
out vec3 vNormal;
out vec4 vColor;
void main(){
  vWorld=aPos; vNormal=aNormal; vColor=aColor;
  gl_Position=uViewProj*vec4(aPos,1.);
}`;

export const FAR_FS = COMMON + FRAME_UNIFORMS + LIGHTING + /* glsl */`
in vec3 vWorld;
in vec3 vNormal;
in vec4 vColor;
uniform sampler2D uLoadMask;
uniform vec2 uWorldSize;
uniform float uNightGlow;
layout(location=0) out vec4 outCol;
void main(){
  // Voxel chunks replace the proxy column by column as they finish meshing.
  float m=texture(uLoadMask,vWorld.xz/uWorldSize).r;
  bool inWorld=vWorld.x>=0.&&vWorld.z>=0.&&vWorld.x<uWorldSize.x&&vWorld.z<uWorldSize.y;
  if(m>.5&&inWorld) discard;
  vec3 n=vNormal;
  vec3 col=vColor.rgb;
  float dist=length(vWorld-uCam);
  float windows=0.;
  float lit=0.;
  // Ground (flagged .3) has no windows in it, however steep.
  if(abs(n.y)<.5&&abs(vColor.a-.3)>.1){
    float t=abs(n.x)>.5?vWorld.z:vWorld.x;
    float pitch=vColor.a>.5?3.:4.;
    float fy=fract((vWorld.y-11.)/6.);
    float fx=fract(t/pitch);
    float aa=clamp(dist*.0015,0.,.5);
    float wx=smoothstep(.5+aa,.5-aa,abs(fx-.5)*1.5);
    float wy=smoothstep(.4+aa,.4-aa,abs(fy-.55));
    windows=wx*wy;
    if(vColor.a>.5) windows=max(windows,.75);
    vec2 cell=vec2(floor(t/pitch),floor((vWorld.y-11.)/6.));
    lit=step(.9985,hash12(cell+floor(vWorld.xz/64.)));
  }
  vec3 glass=mix(col*.25,uHorizon*.8,.5);
  float dark=clamp(uNightGlow,0.,1.);
  glass=mix(glass,vec3(dot(glass,vec3(.3,.5,.2))),dark*.8)*mix(1.,.4,dark);
  vec3 alb=mix(col,glass,windows*.8);
  float ndl=max(dot(n,uSunDir),0.);
  float sh=ndl>0.?sampleShadow(vWorld,n,dist):0.;
  vec3 amb=mix(uGroundCol,uSkyCol,n.y*.5+.5);
  vec3 c=alb*.78*(amb*.8+uSunCol*ndl*sh)+alb*(cityLight(vWorld)+floodLit(vWorld,n));
  if(windows>0.)c+=vec3(1.,.72,.36)*lit*windows*uNightGlow*.5;
  outCol=vec4(applyFog(c,vWorld),1.);
}`;

// --- Ground proxy for unloaded city ---------------------------------------------------
export const GROUND_VS = COMMON + FRAME_UNIFORMS + /* glsl */`
layout(location=0) in vec2 aPos;
uniform float uY;
out vec3 vWorld;
void main(){ vWorld=vec3(aPos.x,uY,aPos.y); gl_Position=uViewProj*vec4(vWorld,1.); }`;

export const GROUND_FS = COMMON + FRAME_UNIFORMS + LIGHTING + /* glsl */`
in vec3 vWorld;
uniform sampler2D uCityMap;
uniform sampler2D uLoadMask;
uniform vec2 uWorldSize;
layout(location=0) out vec4 outCol;
void main(){
  vec2 uv=vWorld.xz/uWorldSize;
  if(texture(uLoadMask,uv).r>.5) discard;
  vec4 m=texture(uCityMap,uv);
  if(m.a<.5) discard;
  float dist=length(vWorld-uCam);
  vec3 n=vec3(0.,1.,0.);
  float sh=sampleShadow(vWorld,n,dist);
  vec3 c=pow(m.rgb,vec3(2.2))*.7*(uSkyCol*.8+uSunCol*max(uSunDir.y,0.)*sh+cityLight(vWorld));
  outCol=vec4(applyFog(c,vWorld),1.);
}`;

// --- Water ---------------------------------------------------------------------------
export const WATER_VS = GROUND_VS;
export const WATER_FS = COMMON + FRAME_UNIFORMS + LIGHTING + /* glsl */`
in vec3 vWorld;
uniform sampler2D uCityMap;
uniform vec2 uWorldSize;
layout(location=0) out vec4 outCol;
float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),f.x),mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),f.x),f.y); }
float nearWater=1.;
// Torch beams, as the water sees them: each pixel follows its own reflection up and finds how close it passes to each beam.
// The ripples in that reflection do the rest, breaking the beam up and dragging it out towards you.
uniform int uWaterBeamN;
uniform vec4 uWaterBeamA[18];  // origin, width at the far end
uniform vec4 uWaterBeamB[18];  // direction, length
uniform vec3 uWaterBeamC[18];
vec3 beamsOnWater(vec3 o,vec3 r,float h){
  vec3 sum=vec3(0.);
  for(int i=0;i<uWaterBeamN;i++){
    vec3 A=uWaterBeamA[i].xyz,d=uWaterBeamB[i].xyz;
    float L=uWaterBeamB[i].w,W=uWaterBeamA[i].w;
    vec3 w0=o-A;
    float b=dot(r,d),dr=dot(r,w0),e=dot(d,w0);
    float t=clamp((e-b*dr)/max(1.-b*b,.001),0.,L);
    vec3 p=A+d*t;
    float s=max(dot(p-o,r),0.);
    vec3 off=p-(o+r*s);
    off.y*=.4;
    float T=clamp(t/L,0.,1.),core=.14+W*T,rad=core+s*.035;
    float k=exp(-dot(off,off)/(rad*rad))*pow(1.-T,1.5)*min(1.,core/rad*1.6);
    // The lens: a hard little point the ripples smear into a streak.
    vec3 toLens=normalize(A-o);
    float lens=pow(max(dot(r,toLens),0.),1400.)*2.2;
    // And where the beam comes down on the water, a patch of it lit from above.
    float pool=0.;
    if(d.y<-.02){
      float th=(o.y-A.y)/d.y;
      if(th>0.&&th<L){
        vec2 q=(o-(A+d*th)).xz,f=normalize(d.xz+vec2(.00001));
        float along=dot(q,f),across=dot(q,vec2(-f.y,f.x)),R=.25+W*th/L;
        pool=exp(-(across*across)/(R*R)-(along*along)/(R*R*min(9.,1./(d.y*d.y))))*pow(max(1.-th/L,0.),1.2)*(.3+.7*smoothstep(.25,.85,h))*.55;
      }
    }
    sum+=uWaterBeamC[i]*(k+lens+pool);
  }
  // One bad pixel here goes through bloom and takes half the screen with it. Whatever happens above, it stops here.
  if(any(isnan(sum))||any(isinf(sum))) return vec3(0.);
  return min(sum,vec3(3.));
}
float wave(vec2 p){
  float chop=vn(p*.11+uTime*vec2(.15,.07))*.6+vn(p*.31-uTime*vec2(.08,.19))*.3+vn(p*.9+uTime*.28)*.1;
  float swell=sin(dot(p,vec2(.17,.11))+uTime*.45+vn(p*.03)*3.)*.5+sin(dot(p,vec2(-.09,.23))+uTime*.34+vn(p*.02+7.)*4.)*.32;
  return chop+swell*.14*nearWater;
}
void main(){
  vec3 v=uCam-vWorld;
  float dist=length(v); v/=dist;
  // Depth precision is coarse far out: never let water fight the distant shoreline.
  if(dist>300.&&texture(uCityMap,vWorld.xz/uWorldSize).a>.5&&all(greaterThan(vWorld.xz,vec2(0.)))&&all(lessThan(vWorld.xz,uWorldSize))) discard;
  float e=.35+dist*.002;
  vec2 p=vWorld.xz;
  nearWater=1.-smoothstep(120.,420.,dist);
  float h=wave(p);
  float rough=.25+.05*nearWater;
  vec3 n=normalize(vec3((h-wave(p+vec2(e,0.)))*2.2/e*rough,1.,(h-wave(p+vec2(0.,e)))*2.2/e*rough));
  float f=.03+.97*pow(1.-max(dot(n,v),0.),5.);
  vec3 r=reflect(-v,n);
  vec3 skyR=mix(uHorizon,uSkyCol,clamp(r.y*1.3,0.,1.));
  float sun=pow(max(dot(r,uSunDir),0.),320.)*18.+pow(max(dot(r,uSunDir),0.),40.)*.25;
  float sh=sampleShadow(vWorld,vec3(0.,1.,0.),dist);
  vec3 deep=vec3(.012,.035,.045)*(uSkyCol*2.+uSunCol*max(uSunDir.y,0.)*.6);
  vec3 c=mix(deep,skyR,f)+uSunCol*sun*sh;
  // The texture of it, drifting: paler water on the backs of the swells, and streaks the wind has laid across them.
  float drift=vn(p*.05+uTime*vec2(.05,.022))*vn(p*.17-uTime*vec2(.03,.075));
  c+=(uSkyCol*.34+uHorizon*.1)*smoothstep(.2,.62,drift)*(.25+.75*smoothstep(.1,1.,h))*.11*nearWater;
  if(uWaterBeamN>0)c+=beamsOnWater(vWorld,r,h)*(.35+f*.65);
  outCol=vec4(applyFog(c,vWorld),.93);
}`;

// --- Sky -----------------------------------------------------------------------------
export const FS_VS = COMMON + /* glsl */`
out vec2 vUV;
void main(){
  vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);
  vUV=p;
  gl_Position=vec4(p*2.-1.,1.,1.);
}`;

export const SKY_FS = COMMON + FRAME_UNIFORMS + /* glsl */`
in vec2 vUV;
uniform mat4 uInvViewProj;
uniform float uNight;
uniform float uSunUp;   // 0 while the sun is under the horizon: its glow shows, its disc does not
uniform float uCloud;
uniform float uStars;
layout(location=0) out vec4 outCol;
float h21(vec2 p){ vec3 q=fract(vec3(p.xyx)*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=vn(p)*a; p=p*2.03+vec2(11.1,7.3); a*=.5; } return s; }
// One layer of the night sky: a few points, each somewhere of its own in its cell, each its own brightness, breathing a little.
float stars(vec2 s,float scale,float density,float size){
  vec2 g=s*scale,id=floor(g),f=fract(g)-.5;
  float h=h21(id);
  if(h<1.-density) return 0.;
  vec2 o=(vec2(h21(id+3.1),h21(id+7.7))-.5)*.6;
  float b=.25+.75*h21(id+11.3);
  float tw=.86+.14*sin(uTime*(.9+h21(id+5.)*2.6)+h*40.);
  return smoothstep(size,size*.2,length(f-o))*b*b*tw;
}
void main(){
  vec4 c=uInvViewProj*vec4(vUV*2.-1.,1.,1.);
  vec3 d=normalize(c.xyz/c.w-uCam);
  float up=clamp(d.y,0.,1.);
  vec3 col=mix(uHorizon,uSkyCol,pow(up,.55));
  float sd=max(dot(d,uSunDir),0.);
  // Sun disc and atmosphere glow. Bright enough to drive bloom and flares.
  col+=uSunCol*(pow(sd,8.)*.08+pow(sd,64.)*.18);
  col+=uSunCol*smoothstep(.9994,.9998,sd)*14.*uSunUp;
  // A pale moon you can see but that lights nothing. The nights here are truly dark.
  float md=max(dot(d,-uSunDir),0.);
  col+=vec3(.5,.54,.62)*smoothstep(.9992,.9996,md)*uNight*.5;
  if(d.y>0.){
    // Mostly a dim dust of them, a few that stand out, and the faint smear of the galaxy behind. It all goes in the camps' glare, and low down in the haze.
    vec2 s=d.xz/(d.y+.35);
    float band=exp(-pow(dot(d,normalize(vec3(.42,.5,.76)))*4.2,2.));
    float glow=band*(.35+.65*smoothstep(.34,.74,fbm(s*2.4+3.7)));
    float faint=stars(s,190.,.13+band*.14,.13),bright=stars(s+7.3,62.,.05,.11);
    vec3 tint=mix(vec3(.72,.8,1.),vec3(1.,.88,.74),h21(floor((s+7.3)*62.)+2.2));
    col+=(vec3(.72,.78,.95)*faint*.11+tint*bright*.3+vec3(.5,.54,.68)*glow*.018)*uNight*smoothstep(.01,.3,d.y)*uStars;
    vec2 p=d.xz/(d.y+.14)*1.6;
    float cl=fbm(p+uTime*.008);
    float cover=smoothstep(.62-uCloud*.28,.92-uCloud*.1,cl);
    vec3 lit=uSunCol*.34*(.5+.5*sd)+uSkyCol*.95;
    float dens=fbm(p*1.6+uSunDir.xz*.7+uTime*.01);
    vec3 cc=mix(lit,uHorizon*.34,smoothstep(.3,.72,dens));
    col=mix(col,cc,cover*smoothstep(.0,.2,d.y)*.9);
  }
  // Haze near the horizon and below it.
  float below=smoothstep(.2,-.01,d.y);
  col=mix(col,uFogCol,below*below);
  outCol=vec4(col,1.);
}`;

// --- Zombies, NPCs, corpses (instanced) -----------------------------------------------
export const ACTOR_VS = COMMON + FRAME_UNIFORMS + /* glsl */`
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aBone; // x = bone id, y = material slot
layout(location=3) in vec4 iPos;  // xyz, yaw
layout(location=4) in vec4 iAnim; // phase, state, variant, extra
uniform sampler2D uVariants;
uniform mat4 uShadowOverride;
uniform int uDepthOnly;
out vec3 vWorld;
out vec3 vNormal;
out vec3 vLocal;
flat out int vVariant;
flat out int vSlot;
out float vDead;
flat out int vFaction;
flat out int vTorch;
flat out float vWet;
out vec3 vAhead;
const vec3 PIVOTS[7]=vec3[7](vec3(0,1.35,0),vec3(0,2.1,0),vec3(-.54,2.02,0),vec3(.54,2.02,0),vec3(-.22,1.15,0),vec3(.22,1.15,0),vec3(0,2.1,0));
mat3 rotX(float a){ float c=cos(a),s=sin(a); return mat3(1,0,0, 0,c,s, 0,-s,c); }
mat3 rotY(float a){ float c=cos(a),s=sin(a); return mat3(c,0,-s, 0,1,0, s,0,c); }
mat3 rotZ(float a){ float c=cos(a),s=sin(a); return mat3(c,s,0, -s,c,0, 0,0,1); }
void main(){
  int raw=int(aBone.x+.5);
  int bone=raw%10;
  int wpn=raw/10;
  vSlot=int(aBone.y+.5);
  float phase=iAnim.x, state=iAnim.y;
  int variant=int(iAnim.z+.5);
  vVariant=variant&511;
  int flags=int(texelFetch(uVariants,ivec2(10,variant&511),0).a*255.+.5);
  // Armour: the whole torso is the vest (a carrier, not a shirt with panels down the sides).
  if((flags&8)!=0&&vSlot==1&&bone==0) vSlot=7;
  int extra=int(iAnim.w+.5);
  int weapon=(extra>>1)&15;
  bool child=(extra&32)!=0;
  bool dog=((extra>>22)&1)==1;
  vFaction=(extra>>6)&15;
  // Carrying a lit torch: 0 none, 1 clean white, 2 an old yellow one, 3 a newer, cooler one. It lights them from in front.
  vTorch=(extra>>10)&3;
  vWet=float((extra>>12)&7)/7.;
  vAhead=vec3(sin(iPos.w),0.,cos(iPos.w));
  bool human=vVariant>=192;
  bool hide=false;
  // The helmet (bone 7) and the cap (bone 6) are both the hat: one or the other, by the flag. Posed the same way from here on.
  if(wpn==15){ if((flags&32)==0) hide=true; }
  else if(bone==6&&(flags&32)!=0) hide=true;
  if(vSlot==6&&(flags&1)==0) hide=true;            // hat
  if(vSlot==14&&(flags&4)==0) hide=true;           // backpack
  if((extra&1)==1&&(bone==1||bone==6)) hide=true;  // head destroyed
  if(wpn>0&&wpn<15&&wpn!=weapon) hide=true;
  if(vSlot==15&&vFaction==0) hide=true;            // armband: camp members only
  vec3 p=aPos, n=aNormal;
  // Heavy armour fills the chest out: wider, and deeper front to back.
  if((flags&16)!=0&&bone==0&&vSlot!=14&&p.y>1.2&&p.y<2.12){ p.x*=1.09; p.z*=1.22; }
  if(!dog){
  float seed=float(variant)*.37;
  float swing=sin(phase);
  // States: 0 idle, .7 walk, 1 chase, 2 attack, 3 aim, 4 talk, 5 sit, 6 work, 7 asleep, 8 falling, 10+ dead.
  float dead=state>=10.?min((state-10.)*1.9,1.):0.;
  vDead=dead;
  bool sitting=state==5.;
  bool asleep=state==7.;
  bool falling=state==8.&&!human;
  bool walking=abs(state-.7)<.01;
  // A swing with something in the hand: 9 to 10 is how far through it they are.
  bool chop=human&&state>=9.&&state<10.;
  float cf=chop?state-9.:0.;
  float wind=chop?smoothstep(0.,.3,cf)*(1.-smoothstep(.3,.5,cf)):0.;
  float hit=chop?smoothstep(.28,.5,cf)*(1.-smoothstep(.62,1.,cf)):0.;
  // Shin and forearm parts are their own bones, but they follow the leg or arm they hang from.
  float sideX=aPos.x<0.?-1.:1.;
  int limb=bone==7?4:(bone==8?5:(bone==9?(sideX<0.?2:3):bone));
  bool upper=limb==2||limb==3;
  bool twoHand=weapon>=2&&weapon<=7;
  // Long guns held properly in both hands: across the chest with the muzzle up and left while carried, brought in to the middle of
  // the body and level when aimed, the left hand on the gun both times. Worked out against these arms and these guns.
  // With a lit torch on the gun they carry it up and ready, so the light comes from where they are looking, not from out in front of a lowered gun.
  // Up and ready: a lit torch on the gun, or a gun fired in the last few seconds (bit 21). Walking or standing, the gun stays on aim.
  bool ready=((extra>>21)&1)==1;
  bool aiming=state==3.||((vTorch>0||ready)&&state<2.5&&!sitting&&!asleep&&!falling);
  bool held=human&&twoHand&&!sitting&&!asleep&&state!=4.&&state!=6.&&state<9.;
  vec3 lh=weapon==3?vec3(-.06,.38,.96):(weapon==4?vec3(-.08,.42,.87):(weapon==6?vec3(-.12,.46,.75):vec3(-.32,.52,.3)));
  if(aiming) lh=vec3(-.95,.56,.28);
  mat3 B=mat3(1.);
  float joint=0.;
  if(state<10.){
    if(limb>=4&&limb<=5){
      float s=limb==4?swing:-swing;
      // A child on a grown-up's seat: thighs along it, shins sticking out over the front edge rather than down through it.
      if(sitting){ B=rotX(-1.32)*rotZ(limb==4?.1:-.1); joint=child?.3:1.15; }
      // Legs trailing and kicking at nothing, each at its own speed.
      else if(falling){ B=rotX(.3+sin(uTime*(limb==4?6.3:7.9)+seed)*.42)*rotZ(limb==4?.2:-.2); joint=.5+sin(uTime*6.+seed+float(limb))*.28; }
      else if(asleep){ B=rotX(limb==4?.08:-.08); joint=limb==4?.2:.34; }
      else {
        float amp=human?(walking?.62:0.):(state>=.5?.78:.42);
        B=rotX(s*amp);
        // A knee bends while the leg swings through, and is straight when it takes the weight.
        float lift=max(0.,-cos(phase+(limb==4?0.:3.1416)));
        joint=human?(walking?lift*.8+.04:.03):(state>=.5?lift*.7+.08:lift*.22+.06);
      }
    } else if(upper){
      float sway=human?(walking?(limb==2?-swing:swing)*(weapon>0?.16:.42):sin(uTime*1.1+seed)*.018):(limb==2?-swing:swing)*.22;
      if(held) sway*=.15;
      float raise;
      if(human){
        if(asleep) raise=.0;
        else if(sitting) raise=-.55;
        else if(state==3.||(aiming&&weapon>0&&weapon<8)) raise=-1.5;
        else if(state==4.&&limb==2) raise=-.7+sin(uTime*2.6+seed)*.36;
        else if(state==6.&&limb==3) raise=-1.05+sin(uTime*6.+seed)*.5;
        else if(limb==3) raise=weapon>0?(twoHand?-.62:-.3):-.1;
        else raise=twoHand?-.48:-.1;
      } else {
        raise=state>=2.?-1.6-sin(uTime*11.+seed)*.55:(state>=1.?-1.38:-.15+sin(seed)*.2);
      }
      // Arms thrown up and out, clawing at the air.
      if(falling) raise=-2.35+sin(uTime*8.3+seed+float(limb)*1.7)*.3;
      float inward=falling?(limb==2?.42:-.42):(human&&limb==2&&(state==3.||(aiming&&weapon>0&&weapon<8)||(twoHand&&state!=4.)))?.42:(limb==2?.08:-.08);
      if(held){
        if(limb==3){ raise=aiming?.3:0.; inward=aiming?-1.3:-.08; }
        else { raise=lh.x; inward=lh.y; }
      }
      // The swing: up and back over the shoulder, then down hard and across, and back to guard. The other arm comes up to fend.
      if(chop){
        if(limb==3){ raise=-.35-2.3*wind+1.55*hit*(1.-wind)-.4*hit; inward=-.08-.35*hit; }
        else { raise=-.75; inward=.3; }
      }
      B=rotX(raise+sway)*rotZ(inward);
      // Elbows: hands come up to whatever they are doing. The gun hand stays locked to the gun.
      if(human){
        if(held) joint=limb==3?(aiming?1.1:.4):lh.z;
        else if(chop) joint=limb==3?.9*wind+.15:1.1;
        else if(limb==3&&weapon>0) joint=0.;
        else if(asleep) joint=.1;
        else if(sitting) joint=.75;
        else if(state==4.) joint=limb==2?.95+sin(uTime*3.3+seed)*.3:.22;
        else if(state==6.) joint=limb==3?.7+sin(uTime*6.+seed)*.55:.5+sin(uTime*2.+seed)*.2;
        else if(walking) joint=.34;
        else if(twoHand&&limb==2) joint=.32;
        else joint=.16+sin(uTime*.7+seed)*.03;
      } else joint=falling?.34:(state>=2.?.5+sin(uTime*12.+seed)*.4:.18);
    } else if(limb==1||limb==6){
      // People look around them. The infected just loll.
      float tilt=human?sin(uTime*.4+seed)*.05:sin(seed*3.1)*.3+sin(uTime*.9+seed)*.08;
      float look=(human&&state!=3.&&!asleep)?sin(uTime*.31+seed*2.)*.42*smoothstep(-.3,.6,sin(uTime*.13+seed)):0.;
      B=rotY(look)*rotZ(tilt)*rotX(human?(sitting?.12:0.):.18+sin(seed*5.)*.15);
    }
  } else {
    // Limp limbs once down.
    // Arms down by the sides, a little way out and each a little different: never folded in across the chest, never spread wide,
    // never held up off the ground. A body on its back lets them fall back a touch; face down, forward a touch. Elbows only slack.
    if(upper){
      float back=mod(seed,2.)>1.?1.:-1.;
      float h1=fract(sin(seed*12.9898+float(limb)*78.233)*43758.5453), h2=fract(sin(seed*4.1414+float(limb)*19.19)*24634.6345);
      float spread=.04+h1*.2;
      B=rotX(back*(.04+h2*.12))*rotZ(limb==2?-spread:spread);
      joint=.03+h2*.12;
    }
    if(limb==4||limb==5){ B=rotZ(limb==4?.22:-.22); joint=.1+abs(sin(seed*5.+float(limb)))*.5; }
  }
  if(bone==7||bone==8){ vec3 k=vec3(bone==7?-.2:.2,.6,0.); p=rotX(joint)*(p-k)+k; n=rotX(joint)*n; }
  else if(bone==9){ vec3 k=vec3(sideX*.55,1.6,.05); p=rotX(-joint)*(p-k)+k; n=rotX(-joint)*n; }
  // A long gun in both hands turns at the grip to lie the way the hands hold it, and goes with the bend of the arm holding it.
  if(wpn>0&&wpn<15&&held){
    mat3 C=aiming?rotX(1.1)*rotZ(1.3)*rotX(-1.8):rotX(-1.7)*rotZ(-1.2);
    vec3 grip=vec3(.55,1.1,.05);
    p=C*(p-grip)+grip; n=C*n;
    vec3 k=vec3(.55,1.6,.05);
    mat3 J=rotX(-(aiming?1.1:.4));
    p=J*(p-k)+k; n=J*n;
  } else if(wpn>0&&wpn<15&&chop){
    // Mid-swing the blade or bat runs on out along the arm, and follows the bend of the elbow.
    mat3 C=rotX(-.35+.3*hit);
    vec3 grip=vec3(.55,1.1,.05);
    p=C*(p-grip)+grip; n=C*n;
    vec3 k=vec3(.55,1.6,.05);
    mat3 J=rotX(-(.9*wind+.15));
    p=J*(p-k)+k; n=J*n;
  } else if(wpn>0&&wpn<15&&state<10.&&state!=3.&&!(aiming&&weapon>0&&weapon<8)){
    float carry=weapon==1?-.4:(weapon<=7?-.86:(weapon==12?-1.:-1.1));
    float across=weapon<=7?-.26:-.1;
    mat3 C=rotX(carry)*rotZ(across);
    vec3 grip=vec3(.55,1.1,.05);
    p=C*(p-grip)+grip;
    n=C*n;
  }
  vec3 piv=PIVOTS[min(limb,6)];
  p=B*(p-piv)+piv;
  n=B*n;
  // A torch on the gun: both arms and the gun tip up or down together about the shoulders, the same angle as the beam (game/npcs.js
  // heldPoint works the torch out with this same arithmetic).
  if(upper&&aiming&&weapon>0&&weapon<8&&state<10.){
    float tp=-(float((extra>>15)&63)/63.*1.2-.8);
    mat3 T=rotX(tp); vec3 sh=vec3(0.,2.02,0.);
    p=T*(p-sh)+sh; n=T*n;
  }
  // Standing people breathe, and shift their weight from time to time.
  if(human&&state<10.&&!asleep){
    p.y+=sin(uTime*1.5+seed)*.008*clamp(p.y-.9,0.,2.);
    if(!sitting&&!walking&&limb!=4&&limb!=5){ mat3 W=rotZ(sin(uTime*.27+seed*1.3)*.022); p=W*(p-vec3(0,1.2,0))+vec3(0,1.2,0); n=W*n; }
    // Upper body only: tilting the legs as well would lift a foot off the ground.
    if(walking&&limb!=4&&limb!=5){ mat3 W=rotZ(sin(phase)*.02)*rotX(.04); vec3 h=vec3(0,1.2,0); p=W*(p-h)+h; n=W*n; }
    // Into the swing with the whole body: turned away and leaning back on the wind-up, then over and round on the blow.
    if(chop&&limb!=4&&limb!=5){ mat3 W=rotY(-.45*wind+.55*hit)*rotX(-.12*wind+.32*hit); vec3 h=vec3(0,1.2,0); p=W*(p-h)+h; n=W*n; }
  }
  // Forward lean and shamble bob for the infected; survivors stand up straight.
  // Coming down, a body pitches forward or back a little, whichever way it left the ledge.
  float lean=falling?(mod(seed,2.)>1.?.42:-.3):(state<10.&&!human)?(.1+sin(seed*2.3)*.09)+(state>=1.?.1:0.):0.;
  mat3 L=rotX(lean)*rotZ((state<10.&&!human)?sin(phase*.5+seed)*.05:0.);
  p=L*p; n=L*n;
  p.y+=state<10.?abs(sin(phase))*.05:0.;
  // A seated hip rests on top of a one-voxel bench.
  if(sitting) p.y-=.08;
  if(asleep){
    mat3 F=rotX(-1.53);
    p=F*p; n=F*n;
    p.y+=.28;
  }
  if(child){
    p*=.66;
    // Up on the seat where a grown-up's hips would be, sat in the middle of it, so a table in front is not in the way.
    if(sitting) p.y+=.36;
  }
  if(dead>0.){
    // Topple around the ankles and settle on the ground.
    mat3 F=rotX(-dead*1.5*(mod(seed,2.)>1.?1.:-1.));
    p=F*p; n=F*n;
    p.y+=(child?.15:.22)*dead;
    p.y-=max(state-122.,0.)*.08;
  }
  } else {
    // A dog (bit 22): body, head, four legs and a tail, each on its own hinge. 0 standing about, .7 trotting along, 1 running,
    // 5 sat on its haunches, 7 lying down. The legs go in diagonal pairs, the tail never quite stops.
    vDead=0.;
    float sw=sin(phase), dseed=float(variant)*.37;
    bool moving=state>.5&&state<2.;
    float amp=state>=1.?.8:moving?.55:0.;
    vec3 piv=vec3(0.); mat3 B=mat3(1.);
    if(bone>=2&&bone<=5){
      bool front=bone<=3, left=bone==2||bone==4;
      piv=vec3(left?-.1:.1,.4,front?.3:-.3);
      float a=((bone==2||bone==5)?sw:-sw)*amp;
      if(state==5.&&!front) a=-1.35;
      if(state==7.) a=front?-1.4:1.3;
      B=rotX(a);
    } else if(bone==1){
      piv=vec3(0.,.72,.45);
      float still=(state<.5||state==5.)?1.:.3;
      B=rotY(sin(uTime*.45+dseed)*.3*still)*rotX((moving?sin(phase*2.)*.07:0.)+(state==7.?.2:0.));
    } else if(bone==6){
      piv=vec3(0.,.78,-.5);
      float wag=sin(uTime*(state>=1.?15.:state==5.?12.:8.)+dseed)*(state==7.?.2:.6);
      B=rotY(wag)*rotX(state==7.?-.5:0.);
    }
    p=B*(p-piv)+piv; n=B*n;
    if(state==5.){ mat3 T=rotX(-.5); vec3 h=vec3(0.,.4,-.3); p=T*(p-h)+h; n=T*n; p.y-=.1; }
    if(state==7.) p.y-=.3;
    if(moving) p.y+=abs(sw)*.035;
  }
  float cy=cos(iPos.w), sy=sin(iPos.w);
  vec3 wp=vec3(p.x*cy+p.z*sy,p.y,-p.x*sy+p.z*cy)+iPos.xyz;
  vNormal=vec3(n.x*cy+n.z*sy,n.y,-n.x*sy+n.z*cy);
  vWorld=wp;
  // A touch inside the surface: right on it, floor() lands either side of a whole cell at random, and the pattern shimmers.
  vLocal=aPos-aNormal*.05;
  gl_Position=uViewProj*vec4(wp,1.);
  if(hide) gl_Position=vec4(2.,2.,2.,1.);
}`;

export const ACTOR_FS = COMMON + FRAME_UNIFORMS + LIGHTING + /* glsl */`
in vec3 vWorld;
in vec3 vNormal;
in vec3 vLocal;
flat in int vVariant;
flat in int vSlot;
in float vDead;
flat in int vFaction;
flat in int vTorch;
flat in float vWet;
in vec3 vAhead;
uniform sampler2D uVariants;
uniform float uNightGlow;
uniform vec3 uFactions[10];
layout(location=0) out vec4 outCol;
void main(){
  vec3 col=vSlot==15?pow(uFactions[clamp(vFaction,0,9)],vec3(2.2)):pow(texelFetch(uVariants,ivec2(vSlot,vVariant),0).rgb,vec3(2.2));
  // Chunky voxel grime and blood splatter, different per body.
  // Raiders cover their faces: a black hood with one of a few masks on it, so you can tell them from anyone else at a distance.
  if(vVariant>=232&&vVariant<240&&vLocal.y>2.08&&(vSlot==0||vSlot==5||vSlot==6||vSlot==8||vSlot==9)){
    int mx=int(floor(vLocal.x*10.)),my=int(floor(vLocal.y*10.)),style=vVariant%4;
    bool eyes=my==24&&(mx==-2||mx==-3||mx==1||mx==0);
    col=vec3(.012,.012,.015);
    if(vLocal.z>.24&&my<27){
      if(style==0){        // Skull: bone, black sockets, a row of teeth.
        col=vec3(.66,.63,.52);
        if(eyes||(my==23&&mx>=-1&&mx<=0)) col=vec3(.006);
        if(my==21&&(mx&1)==0) col=vec3(.01);
      } else if(style==1){ // Red bandana, up over the nose.
        col=my<=23?vec3(.5,.035,.03):my==24?vec3(.3,.2,.14):vec3(.012);
        if(my==24&&(mx==-2||mx==1)) col=vec3(.006);
      } else if(style==2){ // Hockey mask, with a slash of red paint across it.
        col=vec3(.72,.7,.6);
        if(eyes) col=vec3(.006);
        if(my==22&&(mx&1)!=0) col=vec3(.03);
        if(mx-my==-24||mx-my==-25) col=vec3(.5,.04,.03);
      } else {             // Gas mask: rubber, two yellow lenses and a filter.
        col=vec3(.04,.05,.03);
        if(eyes) col=vec3(.78,.55,.08);
        if(my<=22&&mx>=-1&&mx<=0) col=vec3(.26,.26,.28);
      }
    }
  }
  vec3 q=floor(vLocal*10.);
  float h=hash12(q.xy+q.z*11.3+float(vVariant)*3.1);
  col*=.86+.24*h;
  if(vVariant<192){
    vec3 c=floor(vLocal*3.3)+float(vVariant)*.73;
    float blood=hash12(c.xy+c.z*5.7);
    if(blood>.74&&h>.28&&vSlot!=8&&vSlot!=6) col=mix(col,vec3(.14,.005,.005),.88);
    if(vLocal.y>2.05&&vLocal.y<2.4&&vLocal.z>.2&&h>.5&&vSlot==0) col=vec3(.1,.005,.005);
  }
  vec3 n=normalize(vNormal);
  float dist=length(vWorld-uCam);
  float ao=mix(.55,1.,clamp(vWorld.y-floor(vWorld.y)+vLocal.y*.45,0.,1.));
  // Soaked: cloth and skin go dark with water, with dark runs down the front where it is still coming off them.
  float wetK=vWet;
  if(wetK>0.){
    float run=step(.55,hash12(vec2(floor(vLocal.x*10.)+floor(vLocal.z*10.)*7.,float(vVariant))))*smoothstep(.4,1.4,vLocal.y)*.12;
    col*=1.-wetK*(.3+run);
  }
  vec3 c=shade(col,vWorld,n,1.,ao,dist);
  if(wetK>0.){
    // And a sheen on it: whatever the sky and the lamps give, caught at the edges, with a few beads catching the light on the shoulders and the hat.
    vec3 v=normalize(uCam-vWorld);
    float rim=pow(1.-max(dot(n,v),0.),3.);
    vec3 env=uSkyCol*.55+uHorizon*.25+cityLight(vWorld)*.5+dynLights(vWorld,n)*.15;
    c+=env*rim*wetK*.55;
    vec3 bq=floor(vLocal*20.);
    float bead=step(.978,hash12(bq.xz+bq.y*3.7+float(vVariant)*1.3+floor(uTime*.6+hash12(bq.xy)*5.)))*step(.4,n.y);
    c+=env*bead*smoothstep(.5,.9,wetK)*.22;
  }
  // What a torch throws back off the ground and off whatever it lands on: just enough to make out who is holding it.
  if(vTorch>0){
    float wrap=dot(n,vAhead)*.5+.5;
    vec3 bounce=vTorch==2?vec3(1.,.74,.48):vTorch==3?vec3(.84,.92,1.):vec3(.95,.95,.9);
    c+=col*bounce*(.035+.18*wrap*wrap)*uNightGlow;
  }
  outCol=vec4(applyFog(c,vWorld),1.);
}`;

export const ACTOR_SHADOW_VS = COMMON + /* glsl */`
layout(location=0) in vec3 aPos;
layout(location=2) in vec2 aBone;
layout(location=3) in vec4 iPos;
layout(location=4) in vec4 iAnim;
uniform mat4 uMat;
void main(){
  float cy=cos(iPos.w), sy=sin(iPos.w);
  vec3 wp=vec3(aPos.x*cy+aPos.z*sy,aPos.y,-aPos.x*sy+aPos.z*cy)+iPos.xyz;
  gl_Position=uMat*vec4(wp,1.);
  // Optional gear never casts, and only the carried weapon does.
  int wpn=int(aBone.x+.5)/10;
  int slot=int(aBone.y+.5);
  if((wpn>0&&wpn!=((int(iAnim.w+.5)>>1)&15))||slot==6||slot==14||slot==15) gl_Position=vec4(2.,2.,2.,1.);
}`;

// --- Debris cubes ------------------------------------------------------------------------
export const CUBE_VS = COMMON + FRAME_UNIFORMS + /* glsl */`
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec4 iPos;  // xyz, size
layout(location=3) in vec4 iCol;  // rgb, spin angle
layout(location=4) in float iGlow;
out vec3 vWorld;
out vec3 vNormal;
out vec3 vCol;
out float vGlow;
void main(){
  float a=iCol.a, c=cos(a), s=sin(a);
  // A glow below zero marks a part of something built (a vehicle): turned about the vertical only, not tumbling. Its glow is -1 - that.
  bool built=iGlow<-.5;
  mat3 R=built?mat3(c,0,-s, 0,1,0, s,0,c):mat3(c,0,-s, 0,1,0, s,0,c)*mat3(1,0,0, 0,c,s, 0,-s,c);
  vec3 p=R*(aPos*iPos.w)+iPos.xyz;
  vWorld=p; vNormal=R*aNormal; vCol=iCol.rgb; vGlow=built?-1.-iGlow:iGlow;
  gl_Position=uViewProj*vec4(p,1.);
}`;

export const CUBE_FS = COMMON + FRAME_UNIFORMS + LIGHTING + /* glsl */`
in vec3 vWorld;
in vec3 vNormal;
in vec3 vCol;
in float vGlow;
layout(location=0) out vec4 outCol;
void main(){
  vec3 col=pow(vCol,vec3(2.2));
  float dist=length(vWorld-uCam);
  vec3 c=shade(col,vWorld,normalize(vNormal),1.,.9,dist)+col*vGlow;
  outCol=vec4(applyFog(c,vWorld),1.);
}`;

// --- Soft sprites: smoke, fire, muzzle flash, tracers -----------------------------------------
export const SPRITE_VS = COMMON + FRAME_UNIFORMS + LIGHTING + /* glsl */`
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 iPos;  // xyz, size
layout(location=2) in vec4 iCol;  // rgb, alpha
layout(location=3) in vec4 iData; // kind, rotation, stretch dir (xy packed in vel below)
layout(location=4) in vec3 iVel;
uniform vec3 uRight;
uniform vec3 uUp;
out vec2 vUV;
out vec4 vCol;
flat out float vKind;
out vec3 vWorld;
out float vViewZ;
out vec3 vLit;
out float vHeat;
out float vSeed;
out float vSize;
void main(){
  vec3 wp;
  vHeat=iData.w;
  vSize=iPos.w;
  vSeed=fract(iData.y*.159);
  // Smoke takes the light of what is around it, once for the whole puff: the city's lamps, any fire under it.
  vLit=iData.x<.5?dynLights(iPos.xyz,normalize(uCam-iPos.xyz)*.6+vec3(0.,-.4,0.)):vec3(0.);
  if(iData.x>2.5){
    // Tracer: a quad stretched along its velocity, facing the camera.
    vec3 dir=normalize(iVel+vec3(0.,1e-5,0.));
    vec3 side=normalize(cross(dir,normalize(iPos.xyz-uCam)));
    wp=iPos.xyz+dir*aCorner.y*iData.z+side*aCorner.x*iPos.w;
  } else if(iData.x<.5){
    // Smoke is drawn out along the way it is going, the more the faster it moves: a trail rather than a ball.
    vec2 v=vec2(dot(iVel,uRight),dot(iVel,uUp));
    float sp=length(v);
    vec2 d=sp>.05?v/sp:vec2(0.,1.);
    float e=1.+min(1.1,sp*.45);
    vec2 q=(d*aCorner.y*e+vec2(d.y,-d.x)*aCorner.x/sqrt(e))*iPos.w;
    wp=iPos.xyz+uRight*q.x+uUp*q.y;
  } else {
    float c=cos(iData.y), s=sin(iData.y);
    vec2 q=vec2(aCorner.x*c-aCorner.y*s,aCorner.x*s+aCorner.y*c)*iPos.w;
    wp=iPos.xyz+uRight*q.x+uUp*q.y;
  }
  vUV=aCorner*.5+.5;
  vCol=iCol;
  vKind=iData.x;
  vWorld=wp;
  gl_Position=uViewProj*vec4(wp,1.);
  vViewZ=gl_Position.w;
}`;

export const SPRITE_FS = COMMON + FRAME_UNIFORMS + /* glsl */`
in vec2 vUV;
in vec4 vCol;
flat in float vKind;
in vec3 vWorld;
in float vViewZ;
in vec3 vLit;
in float vHeat;
in float vSeed;
in float vSize;
uniform vec3 uRight;
uniform vec3 uUp;
uniform sampler2D uDepth;
uniform vec2 uResolution;
uniform vec2 uNearFar;
layout(location=0) out vec4 outCol;
float h21(vec2 p){ vec3 q=fract(vec3(p.xyx)*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
float linearize(float d){ float z=d*2.-1.; return 2.*uNearFar.x*uNearFar.y/(uNearFar.y+uNearFar.x-z*(uNearFar.y-uNearFar.x)); }
void main(){
  float sceneZ=linearize(texture(uDepth,gl_FragCoord.xy/uResolution).r);
  // Smoke fades out over a depth as deep as the puff is wide where it meets the ground or a wall, so a big cloud of dust settles into
  // the street instead of being sliced off along it.
  float soft=vKind<.5?smoothstep(0.,1.,clamp((sceneZ-vViewZ)/max(2.2,vSize*.9),0.,1.)):clamp((sceneZ-vViewZ)*1.6,0.,1.);
  if(soft<=0.) discard;
  vec2 p=vUV*2.-1.;
  float r=length(p);
  if(vKind<.5){
    // Smoke: a lumpy ball of it, lit like one. Three layers of noise break the edge up and hollow the inside, the side towards
    // the sun is lit and the far side and the folds are in shade, and where it has just come off a fire it glows from inside.
    vec2 q=vUV*2.6+vSeed*31.;
    // Warped by its own noise, so the edge tears into wisps instead of staying round.
    q+=(vn(q*1.3+uTime*.15)-.5)*1.1;
    float n=vn(q)*.62+vn(q*2.6+4.1)*.38;
    float dens=smoothstep(1.,.12,r*mix(.8,1.25,n)+(n-.5)*1.25);
    float a=dens*vCol.a*soft*clamp((vViewZ-1.5)/12.,0.,1.);
    if(a<.003) discard;
    float nz=sqrt(max(0.,1.-r*r));
    vec3 toCam=normalize(uCam-vWorld);
    vec3 N=normalize(uRight*p.x+uUp*p.y+toCam*nz*.9);
    float sun=max(dot(N,uSunDir),0.), fold=mix(.55,1.05,n);
    vec3 light=uSkyCol*(.55+.35*max(N.y,0.))*fold+uSunCol*(.05+.32*sun)*fold+vLit*.55;
    vec3 c=vCol.rgb*light;
    // Fire under it: orange from inside, brightest at the heart of the puff.
    c+=vec3(1.,.38,.1)*vHeat*dens*(1.-r*.7)*1.6;
    vec3 v=vWorld-uCam; float d=length(v);
    float fog=1.-exp(-d*uFogDensity*.6);
    outCol=vec4(mix(c,uFogCol,fog)*a,a);
  } else if(vKind<1.5){
    // Fire and flash: additive.
    float n=vn(vUV*6.+vCol.gb*9.+uTime*2.);
    float a=smoothstep(1.,.05,r+(n-.5)*.5)*vCol.a*soft;
    outCol=vec4(vCol.rgb*a,0.);
  } else if(vKind<2.5){
    // Spark / glow dot
    float a=smoothstep(1.,0.,r)*vCol.a*soft;
    outCol=vec4(vCol.rgb*a*a,0.);
  } else {
    float a=smoothstep(1.,.0,abs(p.x))*smoothstep(1.,.5,abs(p.y))*vCol.a;
    // A drip in the dark is a dark drip: it still crosses the light behind it.
    float lum=dot(vCol.rgb,vec3(.3,.5,.2));
    outCol=vec4(vCol.rgb*a,vKind>3.5?a*mix(.5,.12,smoothstep(.02,.25,lum)):0.);
  }
}`;

// --- View model / solid boxes ----------------------------------------------------------------
export const BOX_VS = COMMON + /* glsl */`
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
layout(location=3) in float aGlow;
uniform mat4 uProj;
uniform mat4 uModelView;
uniform mat3 uNormalMat;
out vec3 vNormal;
out vec3 vCol;
out float vGlow;
out vec3 vView;
out vec3 vModel;
void main(){
  vModel=aPos;
  vec4 v=uModelView*vec4(aPos,1.);
  vView=v.xyz;
  vNormal=uNormalMat*aNormal;
  vCol=aColor; vGlow=aGlow;
  gl_Position=uProj*v;
}`;

export const BOX_FS = COMMON + /* glsl */`
in vec3 vNormal;
in vec3 vCol;
in float vGlow;
in vec3 vView;
uniform vec3 uSunView;
uniform vec3 uSunCol;
uniform vec3 uSkyCol;
uniform vec3 uGroundCol;
uniform float uSkyVis;
uniform vec3 uFlash;
uniform vec3 uLocalLight;
uniform float uVM;      // 1 for what you are holding: marks its pixels so the screen effects for the world leave it alone
uniform float uWetVM;   // rain on it
uniform float uRainVM;  // rain landing on it now (0 under cover: no new drops, nothing runs)
uniform float uVMTime;  // a clock for the drops on it
uniform float uAdd;     // the muzzle flash: light only, added on
in vec3 vModel;
layout(location=0) out vec4 outCol;
float bh(vec3 p){ return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453); }
void main(){
  vec3 n=normalize(vNormal);
  vec3 col=pow(vCol,vec3(2.2));
  if(uAdd>0.){ outCol=vec4(col*vGlow*uAdd,0.); return; }
  // Wet: the finish goes dark, takes a hard shine, and beads of water sit on it, each catching what light there is.
  float w=uWetVM;
  col*=mix(1.,.72,w);
  float ndl=max(dot(n,uSunView),0.);
  vec3 amb=mix(uGroundCol,uSkyCol,n.y*.5+.5)*mix(.25,1.,uSkyVis);
  vec3 vd=normalize(vView);
  vec3 r=reflect(vd,n);
  float spec=pow(max(dot(r,uSunView),0.),mix(32.,90.,w));
  float fres=pow(1.-max(dot(-vd,n),0.),3.);
  vec3 light=amb+uSunCol*ndl*uSkyVis*.8+uFlash*(.4+.6*max(n.z,0.))+uLocalLight*(.6+.4*max(n.y,0.));
  vec3 c=col*light+uSunCol*spec*(.12+.9*w)*uSkyVis+col*vGlow;
  c+=(mix(uGroundCol,uSkyCol,clamp(r.y*.5+.5,0.,1.))*mix(.25,1.,uSkyVis)+uLocalLight*.5)*fres*w*.35;
  if(w>.01&&uRainVM>.01){
    // Drops, not a pattern: each spot gets a drop now and then, holds it a moment and loses it, every spot on its own clock.
    // Some of them run: down the gun a little way before they go. The rain keeps them coming.
    vec3 cell=floor(vModel*100.);
    float seed=bh(cell+17.), rate=.45+seed*.9, ph=uVMTime*rate+seed*9.;
    float life=fract(ph), gen=floor(ph);
    bool runs=bh(cell+gen*.37+3.)<.3*uRainVM;
    vec3 q=vModel*100.;
    if(runs) q.y+=life*life*2.;
    vec3 rc=floor(q);
    float on=step(1.-.1*w*uRainVM,bh(rc+gen*1.13))*smoothstep(0.,.12,life)*smoothstep(1.,.6,life);
    float bead=on*smoothstep(.35,.0,length(fract(q)-.5));
    // A bead takes some of the colour of what it sits on: water on dark metal, not a white fleck.
    c+=(light*.6+uFlash*.3+vec3(.008))*mix(vec3(1.),.35+col*2.2,.45)*bead*w*1.05;
  }
  outCol=vec4(c,1.-uVM);
}`;

// --- Post processing --------------------------------------------------------------------------
export const SSAO_FS = COMMON + /* glsl */`
in vec2 vUV;
uniform sampler2D uDepth;
uniform mat4 uProj;
uniform mat4 uInvProj;
uniform vec2 uTexel;
out vec4 outCol;
vec3 viewPos(vec2 uv){
  float d=texture(uDepth,uv).r;
  vec4 p=uInvProj*vec4(uv*2.-1.,d*2.-1.,1.);
  return p.xyz/p.w;
}
float h21(vec2 p){ vec3 q=fract(vec3(p.xyx)*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
void main(){
  float d=texture(uDepth,vUV).r;
  if(d>=.9999){ outCol=vec4(1.); return; }
  vec3 P=viewPos(vUV);
  vec3 N=normalize(cross(dFdx(P),dFdy(P)));
  float ang=h21(gl_FragCoord.xy)*6.283;
  float occ=0.;
  float rad=1.6;
  const int K=10;
  for(int i=0;i<K;i++){
    float fi=float(i)+.5;
    float t=fi/float(K);
    float a=ang+fi*2.399;
    float r=sqrt(t);
    // Hemisphere sample in view space.
    vec3 s=vec3(cos(a)*r,sin(a)*r,sqrt(1.-t));
    if(dot(s,N)<0.) s=-s;
    vec3 q=P+s*rad*(.3+.7*t);
    vec4 c=uProj*vec4(q,1.);
    vec2 uv=c.xy/c.w*.5+.5;
    float sz=viewPos(uv).z;
    float range=smoothstep(0.,1.,rad/max(abs(P.z-sz),.001));
    if(sz>q.z+.04) occ+=range;
  }
  float ao=1.-occ/float(K);
  ao=mix(1.,ao,smoothstep(120.,30.,-P.z));
  outCol=vec4(ao,ao,ao,1.);
}`;

export const BLUR_AO_FS = COMMON + /* glsl */`
in vec2 vUV;
uniform sampler2D uTex;
uniform sampler2D uDepth;
uniform vec2 uDir;
uniform vec2 uNearFar;
out vec4 outCol;
float lin(float d){ float z=d*2.-1.; return 2.*uNearFar.x*uNearFar.y/(uNearFar.y+uNearFar.x-z*(uNearFar.y-uNearFar.x)); }
void main(){
  float z0=lin(texture(uDepth,vUV).r);
  float sum=0.,w=0.;
  for(int i=-3;i<=3;i++){
    vec2 uv=vUV+uDir*float(i);
    float z=lin(texture(uDepth,uv).r);
    float k=exp(-abs(z-z0)*2.)*(1.-abs(float(i))/4.);
    sum+=texture(uTex,uv).r*k; w+=k;
  }
  float v=sum/max(w,.001);
  outCol=vec4(v,v,v,1.);
}`;

export const MOTION_DOF_FS = COMMON + /* glsl */`
in vec2 vUV;
uniform sampler2D uScene;
uniform sampler2D uDepth;
uniform mat4 uInvViewProj;
uniform mat4 uPrevViewProj;
uniform vec3 uCamPos;
uniform float uMotion;
uniform float uFocus;
uniform float uAperture;
uniform vec2 uTexel;
uniform vec2 uNearFar;
out vec4 outCol;
float lin(float d){ float z=d*2.-1.; return 2.*uNearFar.x*uNearFar.y/(uNearFar.y+uNearFar.x-z*(uNearFar.y-uNearFar.x)); }
float h21(vec2 p){ vec3 q=fract(vec3(p.xyx)*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
void main(){
  float d=texture(uDepth,vUV).r;
  vec4 w=uInvViewProj*vec4(vUV*2.-1.,d*2.-1.,1.);
  w/=w.w;
  vec4 prev=uPrevViewProj*w;
  vec2 pv=prev.xy/prev.w*.5+.5;
  vec2 vel=(vUV-pv)*uMotion;
  float vl=length(vel);
  if(vl>.02) vel*=.02/vl;
  vec3 col=vec3(0.);
  float jitter=h21(gl_FragCoord.xy);
  const int MB=8;
  for(int i=0;i<MB;i++){
    float t=(float(i)+jitter)/float(MB)-.5;
    col+=texture(uScene,vUV+vel*t).rgb;
  }
  col/=float(MB);
  if(uAperture>0.){
    float z=lin(d);
    float coc=clamp(abs(1./max(z,.1)-1./uFocus)*uAperture*6.,0.,1.);
    if(coc>.02){
      vec3 acc=col; float tot=1.;
      float a=jitter*6.283;
      const int DS=14;
      for(int i=0;i<DS;i++){
        float fi=float(i)+.5;
        float r=sqrt(fi/float(DS))*coc*14.;
        float th=a+fi*2.399;
        vec2 uv=vUV+vec2(cos(th),sin(th))*r*uTexel;
        vec3 s=texture(uScene,uv).rgb;
        float l=dot(s,vec3(.3,.6,.1));
        float k=1.+smoothstep(1.,5.,l)*3.; // bokeh favours bright points
        acc+=s*k; tot+=k;
      }
      col=acc/tot;
    }
  }
  outCol=vec4(col,1.);
}`;

// Drifting banks of mist, lit by the sun where it gets through and by every lamp and fire nearby.
// A short march along each ray at half resolution, so light has something to shine through.
export const VOLUME_FS = COMMON + FRAME_UNIFORMS + LIGHTING + /* glsl */`
in vec2 vUV;
uniform sampler2D uDepth;
uniform mat4 uInvViewProj;
uniform float uVolDensity;
uniform vec2 uWind;
uniform float uRainHaze;
uniform sampler2D uRainMap;   // the highest block of every column round the camera: under it is indoors
uniform vec3 uRainMapO;
out vec4 outCol;
void main(){
  float dz=texture(uDepth,vUV).r;
  vec4 w=uInvViewProj*vec4(vUV*2.-1.,dz*2.-1.,1.);
  vec3 wp=w.xyz/w.w;
  vec3 ray=wp-uCam;
  float len=length(ray);
  vec3 dir=ray/max(len,.001);
  float far=min(len,260.);
  // The samples sit at the same distances along every ray, whatever the ray hits, and each pixel starts at a slightly different
  // spot. Spacing them by the depth of the scene drew the outline of everything behind the mist into the mist itself,
  // and regular spacing showed up as shells of light. They are closer together near you, where it matters.
  const int STEPS=12;
  float j=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
  vec3 acc=vec3(0.);
  float T=1.;
  for(int i=0;i<STEPS;i++){
    float q0=(float(i)+j)/float(STEPS),q1=(float(i)+1.+j)/float(STEPS);
    float t=260.*q0*sqrt(q0),t1=min(260.*q1*sqrt(q1),far);
    if(t>=far) break;
    float dt=t1-t;
    vec3 p=uCam+dir*(t+dt*.5);
    float above=max(p.y-12.,0.);
    float hgt=exp(-above*.034);
    // Banks of mist have a top and a bottom and lean with the wind. They are not columns.
    vec2 drift=p.xz*.012+uWind*uTime*.02+vec2(p.y*.031,-p.y*.023);
    float n=vnoise(drift)*.6+vnoise(drift*2.7+p.y*.02)*.3+vnoise(drift*6.1)*.1;
    // Rain leaves spray hanging everywhere, so a light has something to show up in even outside the mist.
    float dens=uVolDensity*hgt*max(smoothstep(.3,.75,n),uRainHaze);
    // Indoors, under a roof, the air is clear: no bank of mist and no rain spray drifting in through the walls.
    if(uRainMapO.z>0.){
      vec2 rm=(p.xz-uRainMapO.xy)/uRainMapO.z;
      if(all(greaterThanEqual(rm,vec2(0.)))&&all(lessThan(rm,vec2(1.)))&&p.y<textureLod(uRainMap,rm,0.).r*255.+1.) dens*=.15;
    }
    if(dens>.00001){
      vec3 L=uFogCol*.9+cityLight(p)*.14;
      // A fire lights the air around it. It does not light the sky a hundred feet up.
      float lamp=smoothstep(52.,10.,above);
      if(lamp>0.) for(int k=0;k<uLightCount;k++){
        vec3 d=uLightPos[k].xyz-p;
        float l2=dot(d,d),r=uLightPos[k].w;
        if(l2<r*r){ float a=1.-sqrt(l2)/r; L+=uLightCol[k]*a*a*.1*lamp; }
      }
      if(uSpotPos.w>0.){
        vec3 d=p-uSpotPos.xyz;
        float l=length(d);
        L+=vec3(1.,.95,.86)*uSpotPos.w*smoothstep(.925,.99,dot(d/max(l,.001),uSpotDir))/(1.+l*l*.03)*smoothstep(60.,14.,l)*(.22+uRainHaze*.5);
      }
      float a=1.-exp(-dens*dt);
      acc+=T*a*L;
      T*=1.-a;
    }
  }
  outCol=vec4(acc,1.-T);
}`;

export const VOLUME_BLIT_FS = COMMON + /* glsl */`
in vec2 vUV;
uniform sampler2D uTex;
uniform sampler2D uDepth;
uniform vec2 uTexel;
uniform vec2 uNearFar;
out vec4 outCol;
float lin(float d){ float z=d*2.-1.; return 2.*uNearFar.x*uNearFar.y/(uNearFar.y+uNearFar.x-z*(uNearFar.y-uNearFar.x)); }
// Half-resolution mist, brought up to full size without smearing it across the edge of anything nearer.
void main(){
  float z0=lin(texture(uDepth,vUV).r);
  float tol=max(z0*.05,.4);
  vec4 sum=vec4(0.);
  float tot=0.;
  for(int y=-2;y<=2;y++) for(int x=-2;x<=2;x++){
    vec2 uv=vUV+uTexel*vec2(float(x),float(y))*.8;
    float k=exp(-abs(lin(texture(uDepth,uv).r)-z0)/tol)*exp(-float(x*x+y*y)*.22)+.0005;
    sum+=texture(uTex,uv)*k;
    tot+=k;
  }
  outCol=sum/tot;
}`;

// Rain: thousands of long thin quads in a box that travels with the camera, slanted by the wind.
export const RAIN_VS = COMMON + FRAME_UNIFORMS + /* glsl */`
uniform vec3 uWindRain;
uniform vec2 uRainDrift;
uniform float uRainFar;      // 1 for the far layer: a wider box, picked up where the near one leaves off
uniform float uRainFloorV;   // the same as the fragment shader's uRainFloor: how far into the night it is
uniform int uLightCount;
uniform vec4 uLightPos[${MAX_LIGHTS}];
uniform vec3 uLightCol[${MAX_LIGHTS}];
uniform vec4 uSpotPos;
uniform vec3 uSpotDir;
uniform int uSpotN;
uniform vec4 uSpots[${MAX_SPOTS}];
uniform vec4 uSpotDirs[${MAX_SPOTS}];
uniform vec3 uSpotCols[${MAX_SPOTS}];
uniform sampler2D uCityLight;
uniform float uCityLightK;
uniform sampler2D uRainMap;  // the highest block in each column round the camera
uniform vec3 uRainMapO;      // its corner, and its size
out vec2 vP;
out float vA;
out vec3 vLit;
float h(float n){ return fract(sin(n)*43758.5453); }
// How much light this drop is falling through right now.
vec3 lightAtDrop(vec3 p){
  vec3 L=textureLod(uCityLight,p.xz/vec2(5216.,4096.),0.).rgb;
  L=L*L*5.5*uCityLightK*clamp(1.-(p.y-12.)/34.,0.,1.);
  for(int i=0;i<uLightCount;i++){
    vec3 d=uLightPos[i].xyz-p;
    float l=length(d),r=uLightPos[i].w;
    if(l<r){ float a=1.-l/r; L+=uLightCol[i]*a*a*1.4; }
  }
  if(uSpotPos.w>0.){
    vec3 d=p-uSpotPos.xyz;
    float l=length(d);
    L+=vec3(1.,.95,.86)*uSpotPos.w*smoothstep(.86,.975,dot(d/max(l,.001),uSpotDir))/(1.+l*l*.014)*smoothstep(32.,6.,l)*.26;
  }
  for(int i=0;i<uSpotN;i++){
    vec3 d=p-uSpots[i].xyz;
    float l=length(d);
    if(l>uSpotDirs[i].w) continue;
    L+=uSpotCols[i]*uSpots[i].w*smoothstep(.9,.985,dot(d/max(l,.001),uSpotDirs[i].xyz))/(1.+l*l*.012)*1.2;
  }
  return L;
}
void main(){
  // The near box is the rain round you. The far one carries it on across the street and down the block, where a downpour is a grey
  // curtain of long streaks rather than drops you could pick out.
  bool far=uRainFar>.5;
  vec3 BOX=far?vec3(240.,96.,240.):vec3(84.,56.,84.);
  float id=float(gl_InstanceID)+(far?20011.:0.);
  vec3 seed=vec3(h(id*1.37),h(id*2.11+3.),h(id*3.73+7.))*BOX;
  float speed=mix(46.,62.,h(id*5.1));
  vec3 vel=vec3(uWindRain.x*27.,-speed,uWindRain.y*27.);
  // Drift is the wind added up over time: multiplying today's wind by the clock would throw the rain sideways at every gust.
  vec3 q=seed+vec3(uRainDrift.x,-speed*uTime,uRainDrift.y);
  vec3 o=uCam-BOX*.5;
  vec3 base=o+mod(q-o,BOX);
  vec3 toCam=base-uCam;
  float dist=length(toCam);
  vec3 dirV=normalize(vel);
  vec3 side=normalize(cross(dirV,toCam/max(dist,.01)));
  int v=gl_VertexID;
  float cx=(v==0||v==1||v==3)?-1.:1.;
  float cy=(v==0||v==2||v==5)?0.:1.;
  float width=.005+dist*.0011;
  float streak=(.7+h(id*7.7)*.9)*(.5+uWindRain.z*.6)*(far?1.7:1.);
  vec3 wp=base+dirV*cy*streak+side*cx*width;
  vP=vec2(cx,cy);
  // By day the far drops carry a little further and read a little stronger, so a downpour across the street looks like one.
  float day=1.-clamp(uRainFloorV/.09,0.,1.);
  vA=far?smoothstep(36.,50.,dist)*smoothstep(118.,78.,dist)*mix(.75,1.,day)
         :smoothstep(mix(42.,50.,day),8.,dist)*mix(.3,1.,smoothstep(1.,6.,dist))*(1.+day*.35*smoothstep(14.,34.,dist));
  if(vA<.003){ gl_Position=vec4(2.,2.,2.,1.); vP=vec2(0.); vLit=vec3(0.); return; }
  // Under a roof there is no rain. Out past the window there is.
  if(uRainMapO.z>0.){
    vec2 m=(base.xz-uRainMapO.xy)/uRainMapO.z;
    if(all(greaterThanEqual(m,vec2(0.)))&&all(lessThan(m,vec2(1.)))){
      float top=textureLod(uRainMap,m,0.).r*255.;
      if(top>0.&&base.y<top+1.){ gl_Position=vec4(2.,2.,2.,1.); vA=0.; vP=vec2(0.); vLit=vec3(0.); return; }
    }
  }
  vLit=lightAtDrop(base);
  vLit=vLit/(1.+dot(vLit,vec3(.3,.5,.2))*1.6);
  gl_Position=uViewProj*vec4(wp,1.);
}`;

export const RAIN_FS = COMMON + FRAME_UNIFORMS + /* glsl */`
in vec2 vP;
in float vA;
in vec3 vLit;
uniform float uRainAlpha;
uniform float uRainFloor;
layout(location=0) out vec4 outCol;
void main(){
  float a=smoothstep(1.,.1,abs(vP.x))*sin(vP.y*3.14159)*vA*uRainAlpha*.45;
  if(a<.002) discard;
  float litK=clamp(dot(vLit,vec3(.3,.5,.2))*3.,0.,1.);
  vec3 c=(uFogCol*1.5+uSkyCol*.25+uSunCol*.05+vec3(.006,.007,.009))*(1.-.3*litK)+vLit*.62+vec3(.74,.82,1.)*uRainFloor;
  // At night, where nothing lights it, a streak is a shade darker. Anything lit, and all of the day, is left as it was.
  c*=1.-.2*clamp(uRainFloor/.09,0.,1.)*(1.-litK);
  // Lit, a streak is mostly light of its own. Unlit, it is a dark thread across whatever is behind it, there but quiet.
  float lum=dot(c,vec3(.3,.5,.2));
  float day=1.-clamp(uRainFloor/.09,0.,1.);
  outCol=vec4(c*a,a*mix(.42,mix(.18,.26,day),smoothstep(.02,.2,lum)));
}`;

// A torch beam seen from outside: an open cone that is brightest along its axis and fades away to nothing at its rim.
export const BEAM_VS = COMMON + FRAME_UNIFORMS + /* glsl */`
uniform vec3 uBeamPos;
uniform vec4 uBeamDir;  // xyz, length
uniform float uBeamWide;
out float vT;
out vec3 vN;
out vec3 vWorld;
out float vViewZ;
void main(){
  const int SIDES=18;
  int seg=gl_VertexID/6,c=gl_VertexID%6;
  float a=(float(seg)+((c==1||c==2||c==4)?1.:0.))/float(SIDES)*6.28318;
  float t=(c==2||c==4||c==5)?1.:0.;
  vec3 d=uBeamDir.xyz;
  vec3 u=normalize(abs(d.y)>.95?cross(d,vec3(1,0,0)):cross(d,vec3(0,1,0))),w=cross(d,u);
  vec3 rim=u*cos(a)+w*sin(a);
  vec3 wp=uBeamPos+d*uBeamDir.w*t+rim*mix(.07,uBeamWide,t);
  vT=t; vN=rim; vWorld=wp;
  gl_Position=uViewProj*vec4(wp,1.);
  vViewZ=gl_Position.w;
}`;

export const BEAM_FS = COMMON + FRAME_UNIFORMS + /* glsl */`
in float vT;
in vec3 vN;
in vec3 vWorld;
in float vViewZ;
uniform vec3 uBeamCol;
uniform sampler2D uDepth;
uniform vec2 uResolution;
uniform vec2 uNearFar;
layout(location=0) out vec4 outCol;
float linearize(float d){ float z=d*2.-1.; return 2.*uNearFar.x*uNearFar.y/(uNearFar.y+uNearFar.x-z*(uNearFar.y-uNearFar.x)); }
void main(){
  float sceneZ=linearize(texture(uDepth,gl_FragCoord.xy/uResolution).r);
  float soft=clamp((sceneZ-vViewZ)*.7,0.,1.);
  if(soft<=0.) discard;
  vec3 v=normalize(uCam-vWorld);
  float edge=abs(dot(normalize(vN),v));
  float k=pow(edge,2.2)*pow(max(1.-vT,0.),1.7)*soft*clamp((vViewZ-1.)/5.,0.,1.);
  outCol=vec4(uBeamCol*k,0.);
}`;

export const BRIGHT_FS = COMMON + /* glsl */`
in vec2 vUV;
uniform sampler2D uTex;
uniform float uThreshold;
out vec4 outCol;
void main(){
  vec3 c=min(texture(uTex,vUV).rgb,vec3(40.));
  float l=dot(c,vec3(.2126,.7152,.0722));
  float k=smoothstep(uThreshold,uThreshold*2.2,l);
  outCol=vec4(c*k,1.);
}`;

export const DOWN_FS = COMMON + /* glsl */`
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uTexel;
out vec4 outCol;
void main(){
  vec3 c=texture(uTex,vUV).rgb*4.;
  c+=texture(uTex,vUV+uTexel*vec2(-1,-1)).rgb;
  c+=texture(uTex,vUV+uTexel*vec2(1,-1)).rgb;
  c+=texture(uTex,vUV+uTexel*vec2(-1,1)).rgb;
  c+=texture(uTex,vUV+uTexel*vec2(1,1)).rgb;
  outCol=vec4(c/8.,1.);
}`;

export const UP_FS = COMMON + /* glsl */`
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uWeight;
out vec4 outCol;
void main(){
  vec3 c=texture(uTex,vUV+uTexel*vec2(-1,0)).rgb*2.;
  c+=texture(uTex,vUV+uTexel*vec2(1,0)).rgb*2.;
  c+=texture(uTex,vUV+uTexel*vec2(0,-1)).rgb*2.;
  c+=texture(uTex,vUV+uTexel*vec2(0,1)).rgb*2.;
  c+=texture(uTex,vUV+uTexel*vec2(-1,-1)).rgb;
  c+=texture(uTex,vUV+uTexel*vec2(1,-1)).rgb;
  c+=texture(uTex,vUV+uTexel*vec2(-1,1)).rgb;
  c+=texture(uTex,vUV+uTexel*vec2(1,1)).rgb;
  outCol=vec4(c/12.*uWeight,1.);
}`;

export const RAYS_FS = COMMON + /* glsl */`
in vec2 vUV;
uniform sampler2D uDepth;
uniform sampler2D uScene;
uniform vec2 uSunUV;
uniform float uStrength;
out vec4 outCol;
float h21(vec2 p){ vec3 q=fract(vec3(p.xyx)*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
void main(){
  if(uStrength<=0.){ outCol=vec4(0.); return; }
  vec2 d=(uSunUV-vUV)/28.*.9;
  vec2 uv=vUV+d*h21(gl_FragCoord.xy);
  float s=0., w=1.;
  for(int i=0;i<28;i++){
    if(texture(uDepth,uv).r>=.9999){
      float l=min(dot(texture(uScene,uv).rgb,vec3(.33)),4.);
      s+=smoothstep(.6,2.5,l)*w;
    }
    w*=.965;
    uv+=d;
  }
  outCol=vec4(vec3(s/28.)*uStrength,1.);
}`;

export const COMPOSITE_FS = COMMON + /* glsl */`
in vec2 vUV;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uAO;
uniform sampler2D uRays;
uniform float uExposure;
uniform float uBloomAmt;
uniform vec3 uSunCol;
uniform vec3 uFlareData; // sun uv.xy, visibility
uniform float uAspect;
uniform float uHurt;
uniform float uSat;
uniform float uTime;
uniform float uFlash;
uniform float uGlare;   // staring into the sun
uniform float uFade;
uniform float uInfected;
uniform float uRainTint;   // a rainy day: the whole picture goes a little cold and blue
uniform float uGrain;
out vec4 outCol;
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
float h21(vec2 p){ vec3 q=fract(vec3(p.xyx)*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
float flareDisc(vec2 p, vec2 c, float r, float soft){ return smoothstep(r,r*soft,length(p-c)); }
vec3 flare(vec2 uv){
  float vis=uFlareData.z;
  if(vis<=.001) return vec3(0.);
  vec2 s=(uFlareData.xy-.5)*vec2(uAspect,1.);
  vec2 p=(uv-.5)*vec2(uAspect,1.);
  vec3 c=vec3(0.);
  c+=vec3(1.,.6,.3)*flareDisc(p,s*.45,.05,.7)*.022;
  c+=vec3(.4,.7,1.)*flareDisc(p,s*-.3,.09,.85)*.014;
  c+=vec3(.6,1.,.6)*flareDisc(p,s*-.62,.035,.6)*.024;
  c+=vec3(1.,.5,.8)*flareDisc(p,s*-1.1,.13,.9)*.012;
  // Anamorphic streak through the sun.
  float streak=exp(-abs(p.y-s.y)*70.)*exp(-abs(p.x-s.x)*1.4);
  c+=vec3(.55,.68,1.)*streak*.35;
  float halo=exp(-pow(length(p-s)-.38,2.)*220.);
  c+=vec3(1.,.8,.6)*halo*.02;
  return c*vis*uSunCol;
}
void main(){
  vec2 uv=vUV;
  vec2 c=uv-.5;
  float r2=dot(c,c);
  // Colour fringing only when you are badly hurt: at any other time it just doubles every hard edge.
  float ca=uHurt*.006*r2*2.;
  vec3 col;
  col.r=texture(uScene,uv+c*ca).r;
  col.g=texture(uScene,uv).g;
  col.b=texture(uScene,uv-c*ca).b;
  float vm=1.-clamp(texture(uScene,uv).a,0.,1.);
  float ao=mix(texture(uAO,uv).r,1.,vm);
  col*=mix(.72,1.,ao);
  vec3 bloom=texture(uBloom,uv).rgb;
  col+=bloom*uBloomAmt;
  col+=texture(uRays,uv).rgb*uSunCol*.8*(1.-vm);
  col+=flare(uv);
  if(uGlare>.001){
    // A burn round the disc that swallows the edges of whatever is near it, a wide bright halo, and a milky veil over the rest.
    vec2 sp=(uFlareData.xy-.5)*vec2(uAspect,1.), pp=(uv-.5)*vec2(uAspect,1.);
    float d=length(pp-sp);
    col+=uSunCol*uGlare*(exp(-d*d*55.)*1.5+exp(-d*5.)*.3+.055);
  }
  col+=vec3(1.,.82,.6)*uFlash;
  col*=uExposure;
  col=aces(col);
  col=pow(col,vec3(1./2.2));
  // Grade: drained and filmic. Teal in the shadows, a sick warm cast up top, deep blacks kept deep.
  float l=dot(col,vec3(.299,.587,.114));
  vec3 grade=mix(vec3(.86,.97,1.03),vec3(1.05,1.,.9),smoothstep(.06,.7,l));
  col*=grade;
  col=mix(vec3(l),col,uSat);
  // Rain by day: cooler, a touch bluer, the warm colours washed back.
  col=mix(col,mix(vec3(l),col,.8)*vec3(.74,.89,1.18)+vec3(0.,.012,.04)*(l+.04),uRainTint);
  // The look of the shows this city was made to feel like: shot on film, hot and tired. Part bleach bypass (contrast up, colour
  // down), greens pushed to olive and dry yellow, blue skies and steel turned to a dull slate, green-grey in the shadows and a
  // sallow, dusty warmth in the light. Skin and blood keep their colour.
  {
    float L=dot(col,vec3(.299,.587,.114));
    vec3 ov=mix(2.*col*L,1.-2.*(1.-col)*(1.-L),step(.5,L));
    col=mix(col,clamp(ov,0.,1.),.24);
    float green=clamp((col.g-max(col.r,col.b))*5.,0.,1.)*(1.-smoothstep(.6,.88,L));
    col.r+=green*(col.g-col.r)*.45;
    col.b-=green*col.b*.12;
    float blue=clamp((col.b-max(col.r,col.g))*4.,0.,1.);
    L=dot(col,vec3(.299,.587,.114));
    col=mix(col,vec3(L)*vec3(.9,1.,1.05),blue*.42);
    // The warmth sits in the midtones and the lit faces of things; a white sky stays a hazy white, not yellow.
    vec3 warm=mix(vec3(1.05,1.02,.88),vec3(1.,1.,.97),smoothstep(.72,.95,L));
    col*=mix(vec3(.92,1.025,.975),warm,smoothstep(.1,.7,L));
    col=mix(vec3(L),col,.84);
    col=col*.962+vec3(.011,.017,.012);
  }
  // Soft toe and shoulder.
  col=mix(col,col*col*(3.-2.*col),.42);
  col*=vec3(.985,1.,.965);
  // Vignette, hurt pulse, infection tint.
  float vig=smoothstep(.95,.15,r2*1.7);
  col*=mix(.42,1.,vig);
  float hurtPulse=uHurt*(.75+.25*sin(uTime*5.));
  col=mix(col,col*vec3(1.1,.2,.2),hurtPulse*smoothstep(.1,.55,r2*2.4));
  col=mix(col,col*vec3(.75,1.05,.6),uInfected*.5*smoothstep(.05,.5,r2*2.4));
  col+=(h21(gl_FragCoord.xy+fract(uTime)*91.7)-.5)*.018*(.4+l);
  if(uGrain>0.){
    vec2 gp=floor(gl_FragCoord.xy/1.35);
    float gr=(h21(gp+floor(fract(uTime*24.)*97.)*vec2(13.1,7.7))+h21(gp*1.7+floor(fract(uTime*24.)*61.)*vec2(5.3,11.9))-1.);
    col+=gr*uGrain*.11*(1.-.65*smoothstep(.15,.85,l));
  }
  col*=uFade;
  outCol=vec4(col,dot(col,vec3(.299,.587,.114)));
}`;

export const FXAA_FS = COMMON + /* glsl */`
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uTexel;
out vec4 outCol;
void main(){
  vec4 cc=texture(uTex,vUV);
  float lM=cc.a;
  float lNW=textureOffset(uTex,vUV,ivec2(-1,-1)).a;
  float lNE=textureOffset(uTex,vUV,ivec2(1,-1)).a;
  float lSW=textureOffset(uTex,vUV,ivec2(-1,1)).a;
  float lSE=textureOffset(uTex,vUV,ivec2(1,1)).a;
  float lMin=min(lM,min(min(lNW,lNE),min(lSW,lSE)));
  float lMax=max(lM,max(max(lNW,lNE),max(lSW,lSE)));
  if(lMax-lMin<max(.04,lMax*.1)){ outCol=vec4(cc.rgb,1.); return; }
  vec2 dir=vec2(-((lNW+lNE)-(lSW+lSE)),((lNW+lSW)-(lNE+lSE)));
  float red=max((lNW+lNE+lSW+lSE)*.03125,.0078);
  float rc=1./(min(abs(dir.x),abs(dir.y))+red);
  dir=clamp(dir*rc,vec2(-8.),vec2(8.))*uTexel;
  vec3 a=.5*(texture(uTex,vUV+dir*(1./3.-.5)).rgb+texture(uTex,vUV+dir*(2./3.-.5)).rgb);
  vec3 b=a*.5+.25*(texture(uTex,vUV-dir*.5).rgb+texture(uTex,vUV+dir*.5).rgb);
  float lB=dot(b,vec3(.299,.587,.114));
  outCol=vec4((lB<lMin||lB>lMax)?a:b,1.);
}`;
