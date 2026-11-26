/* Perspective viewer for locally packaged Blender geometry. */
(() => {
  'use strict';
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  const unit = v => {
    const length = Math.hypot(...v);
    return length ? v.map(n => n / length) : v;
  };
  const near = .08;
  const css = `
    .arkaden-view {position:relative;width:100%;margin:0;background:#232422;color:#f5f3eb;font:500 14px/1.45 system-ui,sans-serif;}
    .arkaden-view canvas {display:block;width:100%;height:clamp(260px,58vh,640px);touch-action:none;cursor:grab;background:radial-gradient(ellipse at center,#333431,#191a19);}
    .arkaden-view canvas:active {cursor:grabbing;}
    .arkaden-view :focus-visible {outline:3px solid #a5b77d;outline-offset:-4px;}
    .arkaden-view figcaption {display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding:10px 14px;}
    .arkaden-view figcaption small {color:#d4d0ca;font:inherit;font-size:12px;}
    .arkaden-view .lighting-angle {display:inline-flex;align-items:center;gap:7px;padding:0 6px;white-space:nowrap;}
    .lighting-angle input {max-width:105px;accent-color:#b2c48f;}
    .arkaden-view .arkaden-tools {display:flex;flex-wrap:wrap;align-items:center;gap:4px;}
    .arkaden-view button {cursor:pointer;display:inline-grid;place-items:center;background:#383a37;border:0;color:#fff;font:inherit;min-width:42px;min-height:42px;padding:4px 9px;border-radius:3px;}
    .arkaden-view button:hover {background:#50534c;}
    .arkaden-view img {display:block;width:100%;height:auto;}`;
  function typed64(string, Type) {
    const bytes = Uint8Array.from(atob(string), c => c.charCodeAt(0));
    return new Type(bytes.buffer);
  }
  function decodePositions(item) {
    const packed = typed64(item.vertices, Int16Array);
    if (!item.positionOffset && !item.positionScale) return packed;
    const offset = item.positionOffset || [0,0,0];
    const scale = item.positionScale ?? 1;
    return Float32Array.from(packed, (value, i) => value * scale + offset[i % 3]);
  }
  // Build the normal-map axes from mesh edges and UVs, independent of the camera.
  function textureFrame(edge1, edge2, uv, ia, ib, ic) {
    const du1=uv[ib]-uv[ia], dv1=uv[ib+1]-uv[ia+1];
    const du2=uv[ic]-uv[ia], dv2=uv[ic+1]-uv[ia+1];
    const winding=Math.sign(du1*dv2-du2*dv1);
    if (!winding) return null;
    const tangent=unit(edge1.map((v,k) => winding*(v*dv2-edge2[k]*dv1)));
    const bitangent=unit(edge2.map((v,k) => winding*(v*du1-edge1[k]*du2)));
    return [...tangent,...bitangent].map(value => Math.round(value*32767));
  }
  // Normalize each independent scene so small props and large rooms use the same orbit controls.
  const probe = typed64(window.portfolioStudioProbe, Uint8Array);
  const geometryCache = new WeakMap();
  function readScene(source) {
    if (geometryCache.has(source)) return geometryCache.get(source);
    const objects = source.map(item => ({
      coords: decodePositions(item),
      indices: typed64(item.indices, Uint16Array),
      color: item.color,
      normals: item.normals ? typed64(item.normals, Float32Array) : null,
      uv: item.uvs ? typed64(item.uvs, Float32Array) : null,
      blended: item.alphaMode === 'BLEND', texture: item.texture, normalMap:item.normalMap, ormMap:item.ormMap, scatteringMap:item.scatteringMap
    }));
    const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
    let indexCount = 0;
    for (const {coords, indices} of objects) {
      indexCount += indices.length;
      for (let i = 0; i < coords.length; i++) {
        const axis = i % 3;
        low[axis] = Math.min(low[axis], coords[i]);
        high[axis] = Math.max(high[axis], coords[i]);
      }
    }
    if (!indexCount) return null;
    const center = low.map((v, axis) => (v + high[axis]) / 2);
    const factor = 12 / Math.max(1, ...high.map((v, axis) => v - low[axis]));
    const interleaved = new Float32Array(indexCount * 11);
    const frames = objects.some(group => group.normalMap) ? new Int16Array(indexCount*6) : null;
    const groups = [];
    let offset = 0;
    for (const {coords, indices, color, normals, uv, blended, texture, normalMap, ormMap, scatteringMap} of objects) {
      const first = offset / 11;
      const point = i => [0, 1, 2].map(k => (coords[indices[i] * 3 + k] - center[k]) * factor);
      for (let i = 0; i < indices.length; i += 3) {
        const a = point(i), b = point(i + 1), c = point(i + 2);
        const u = b.map((v,k) => v-a[k]), v = c.map((n,k) => n-a[k]);
        const n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
        const length = Math.hypot(...n);
        if (!length) continue;
        const normal = n.map(x => x / length);
        const frame = normalMap && uv && textureFrame(u,v,uv,indices[i]*2,indices[i+1]*2,indices[i+2]*2);
        for (const [corner, position] of [a, b, c].entries()) {
          if (frame) frames.set(frame,offset/11*6);
          interleaved.set(position, offset);
          const normalIndex = indices[i + corner] * 3;
          const smoothNormal = normals?.subarray(normalIndex, normalIndex + 3);
          const smoothLength = smoothNormal?.length === 3 ? Math.hypot(...smoothNormal) : 0;
          interleaved.set(smoothLength > 0 && Number.isFinite(smoothLength) ?
            smoothNormal.map(v => v / smoothLength) : normal, offset + 3);
          interleaved.set(color, offset + 6);
          if (uv) {
            const index = indices[i + corner] * 2;
            interleaved[offset + 9] = uv[index];
            interleaved[offset + 10] = uv[index + 1];
          }
          offset += 11;
        }
      }
      const count = offset / 11 - first;
      const group = {first, count, texture, normalMap, ormMap, scatteringMap};
      if (blended && count) {
        group.center = [0,0,0];
        for (let i=first*11;i<offset;i+=11) {
          for (let axis=0;axis<3;axis++) group.center[axis]+=interleaved[i+axis]/count;
        }
      }
      groups.push(group);
    }
    const result = {data: interleaved.subarray(0, offset), frames:frames?.subarray(0,offset/11*6), groups};
    geometryCache.set(source, result);
    return result;
  }
  // Draw opaque geometry first, then the far and near surfaces of each glass pane.
  function materialPasses(groups, front) {
    const panes = groups.filter(group => group.center);
    if (!panes.length) return groups;
    panes.sort((a,b) => dot(a.center,front)-dot(b.center,front));
    return groups.filter(group => !group.center).concat(panes.flatMap(group =>
      [{...group, side:-1}, {...group, side:1}]));
  }
  function axes(yaw, pitch) {
    const cy=Math.cos(yaw), sy=Math.sin(yaw), cp=Math.cos(pitch), sp=Math.sin(pitch);
    return {right:[cy,sy,0], up:[-sy*sp,cy*sp,cp], front:[sy*cp,-cy*cp,sp]};
  }
  function frameGeometry(data, basis) {
    let radius = .1;
    const points = new Float32Array(data.length / 11 * 3);
    for (let i = 0, j = 0; i < data.length; i += 11, j += 3) {
      const p = data.subarray(i, i + 3);
      radius = Math.max(radius, Math.hypot(...p));
      points[j] = dot(p,basis.right);
      points[j + 1] = dot(p,basis.up);
      points[j + 2] = dot(p,basis.front);
    }
    const distance = radius * 2.7 + near;
    const center = [0,0];
    let lo, hi;
    // Center the perspective outline at the reset angle and fit it with space around the edges.
    for (let pass = 0; pass < 4; pass++) {
      lo = [Infinity, Infinity]; hi = [-Infinity, -Infinity];
      for (let i = 0; i < points.length; i += 3) {
        const scale = distance / (distance - points[i + 2]);
        for (let k = 0; k < 2; k++) {
          const projected = (points[i + k] - center[k]) * scale;
          lo[k] = Math.min(lo[k], projected);
          hi[k] = Math.max(hi[k], projected);
        }
      }
      if (pass < 3) for (let k = 0; k < 2; k++) center[k] += (hi[k] + lo[k]) * .45;
    }
    const target = basis.right.map((v,k) => v*center[0] + basis.up[k]*center[1]);
    return {target, distance,
      width: Math.max(.1, -2*lo[0], 2*hi[0])*1.18,
      height: Math.max(.1, -2*lo[1], 2*hi[1])*1.18};
  }
  function webglRenderer(canvas, {data, frames, groups}) {
    const gl = canvas.getContext('webgl', {alpha:true,antialias:true,powerPreference:'low-power'});
    if (!gl) return null;
    const fragmentPrecision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT)?.precision ? 'highp' : 'mediump';
    const resources = [];
    function shader(kind, source) {
      const result = gl.createShader(kind);
      resources.push(result);
      gl.shaderSource(result,source);
      gl.compileShader(result);
      if (!gl.getShaderParameter(result,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(result));
      return result;
    }
    const program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER,`
      attribute vec3 position, normal, color, tangent, bitangent;
      attribute vec2 uv;
      varying ${fragmentPrecision} vec3 worldPosition, worldNormal;
      varying mediump vec3 texTangent, texBitangent;
      varying ${fragmentPrecision} vec2 texCoord;
      varying mediump vec3 baseColor;
      uniform vec3 right, up, front, target;
      uniform vec2 focalLength;
      uniform float cameraDistance;
      void main() {
        vec3 p=position-target;
        float z=cameraDistance-dot(p,front);
        gl_Position=vec4(dot(p,right)*focalLength.x,dot(p,up)*focalLength.y,z-${2*near},z);
        texCoord=uv;
        baseColor=color;
        worldPosition=position;
        worldNormal=normal;
        texTangent=tangent;
        texBitangent=bitangent;
      }`));
    gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`
      precision ${fragmentPrecision} float;
      varying ${fragmentPrecision} vec3 worldPosition, worldNormal;
      varying mediump vec3 texTangent, texBitangent;
      varying ${fragmentPrecision} vec2 texCoord;
      varying mediump vec3 baseColor;
      uniform sampler2D diffuse, normalMap, ormMap, scatteringMap;
      uniform bool hasDiffuse, hasNormal, hasOrm, hasScattering;
      uniform int glassSide;
      uniform vec3 eye;
      uniform vec2 studioRotation;
      const float PI=3.14159265;
      vec3 linearize(vec3 value) {
        return mix(value/12.92,pow((value+0.055)/1.055,vec3(2.4)),step(vec3(0.04045),value));
      }
      vec3 encodeSrgb(vec3 value) {
        return mix(12.92*value,1.055*pow(value,vec3(1.0/2.4))-0.055,step(vec3(0.0031308),value));
      }
      vec3 surfaceNormal(vec2 st) {
        vec3 n=normalize(worldNormal);
        float face=gl_FrontFacing ? 1.0 : -1.0;
        if (hasNormal) {
          vec3 t=texTangent-n*dot(n,texTangent);
          float lengthSquared=dot(t,t);
          if (lengthSquared>0.000001) {
            t*=inversesqrt(lengthSquared);
            vec3 b=cross(n,t);
            b*=dot(b,texBitangent)<0.0 ? -1.0 : 1.0;
            vec3 mapped=texture2D(normalMap,st).rgb*2.0-1.0;
            return normalize(t*mapped.x-b*mapped.y+n*mapped.z)*face;
          }
        }
        return n*face;
      }
      vec3 fresnel(vec3 f0, float cosine) {
        return f0+(1.0-f0)*pow(1.0-clamp(cosine,0.0,1.0),5.0);
      }
      uniform sampler2D studioProbe;
      vec3 sampleStudio(vec3 direction, float level) {
        float u=atan(direction.y,direction.x)/(2.0*PI)+0.5;
        float v=acos(clamp(direction.z,-1.0,1.0))/PI;
        vec2 uv=vec2(clamp(u,0.5/128.0,127.5/128.0),(level+clamp(v,0.5/64.0,63.5/64.0))/7.0);
        return exp2(texture2D(studioProbe,uv).rgb*(255.0/32.0))-1.0;
      }
      vec3 studioDiffuse(vec3 n) {
        return vec3(0.08)+sampleStudio(n,6.0)*0.80;
      }
      vec3 studioSpecular(vec3 r, float roughness) {
        float level=5.0*roughness;
        return mix(sampleStudio(r,floor(level)),sampleStudio(r,ceil(level)),fract(level))*0.85;
      }
      // Analytic approximation of the integrated GGX BRDF used with prefiltered lighting.
      vec2 environmentBrdf(float roughness, float nv) {
        vec4 r=roughness*vec4(-1.0,-0.0275,-0.572,0.022)+vec4(1.0,0.0425,1.04,-0.04);
        float a004=min(r.x*r.x,exp2(-9.28*nv))*r.x+r.y;
        return vec2(-1.04,1.04)*a004+r.zw;
      }
      vec3 directional(vec3 n, vec3 v, vec3 diffuseColor, vec3 f0, float roughness, float scattering) {
        vec3 l=normalize(vec3(-0.42,-0.69,0.59));
        vec3 h=normalize(v+l);
        float nl=max(dot(n,l),0.0), nv=max(dot(n,v),0.001), nh=max(dot(n,h),0.0);
        float alpha=roughness*roughness, a2=alpha*alpha;
        float d=1.0+nh*nh*(a2-1.0);
        float distribution=a2/max(PI*d*d,0.00001);
        float gv=nl*sqrt(nv*nv*(1.0-a2)+a2);
        float gl=nv*sqrt(nl*nl*(1.0-a2)+a2);
        float visibility=0.5/max(gv+gl,0.001);
        vec3 f=fresnel(f0,dot(v,h));
        vec3 reflection=(1.0-f)*diffuseColor*(nl/PI)+f*(distribution*visibility*nl);
        float wrap=max((dot(n,l)+0.4)/1.4,0.0)-nl;
        vec3 subsurface=diffuseColor*vec3(1.0,0.43,0.25)*(scattering*wrap*0.46);
        return vec3(1.19,1.10,1.00)*(reflection+subsurface);
      }
      vec3 toneMap(vec3 value) {
        value=max(value,vec3(0.0));
        return clamp((value*(2.51*value+0.03))/(value*(2.43*value+0.59)+0.14),0.0,1.0);
      }
      vec3 toStudio(vec3 direction) {
        vec2 rotated=mat2(studioRotation.x,-studioRotation.y,studioRotation.y,studioRotation.x)*direction.xy;
        return vec3(rotated,direction.z);
      }
      void main() {
        vec2 wrapped=fract(texCoord);
        vec2 st=vec2(wrapped.x,1.0-wrapped.y);
        vec3 rgb=baseColor;
        float alpha=1.0;
        if (hasDiffuse) {
          vec4 sampleColor=texture2D(diffuse,st);
          rgb=sampleColor.rgb;
          alpha=sampleColor.a;
        }
        vec3 n=surfaceNormal(st);
        if (glassSide==0 && alpha<0.5) discard;
        if (glassSide!=0 && (gl_FrontFacing ? 1 : -1)!=glassSide) discard;
        vec3 v=normalize(eye-worldPosition);
        n=toStudio(n);
        v=toStudio(v);
        vec3 base=hasDiffuse ? linearize(rgb) : rgb;
        vec3 orm=hasOrm ? texture2D(ormMap,st).rgb : vec3(1.0,0.55,0.0);
        float scattering=hasScattering ? texture2D(scatteringMap,st).r : 0.0;
        float roughness=clamp(orm.g,0.09,1.0), metallic=orm.b;
        float nv=max(dot(n,v),0.0);
        vec3 f0=mix(vec3(0.04),base,metallic);
        vec3 diffuseColor=base*(1.0-metallic);
        vec3 irradiance=studioDiffuse(n);
        vec3 transmission=studioDiffuse(-n)*vec3(0.50,0.18,0.09);
        vec3 indirectDiffuse=mix(irradiance,irradiance*0.95+transmission,scattering*0.46)
          *diffuseColor*(1.0-f0)*orm.r;
        vec2 brdf=environmentBrdf(roughness,nv);
        float specularOcclusion=clamp(pow(nv+orm.r,exp2(-16.0*roughness-1.0))-1.0+orm.r,0.0,1.0);
        vec3 indirectSpecular=studioSpecular(reflect(-v,n),roughness)
          *max(f0*brdf.x+brdf.y,vec3(0.0))*specularOcclusion;
        vec3 lit=indirectDiffuse+indirectSpecular+directional(n,v,diffuseColor,f0,roughness,scattering);
        gl_FragColor=vec4(encodeSrgb(toneMap(lit*0.85)),glassSide==0 ? 1.0 : alpha);
      }`));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
    ['position','normal','color','uv'].forEach((name,i) => {
      const index = gl.getAttribLocation(program,name);
      gl.enableVertexAttribArray(index);
      gl.vertexAttribPointer(index,i === 3 ? 2 : 3,gl.FLOAT,false,44,12*i);
    });
    let frameBuffer;
    if (frames) {
      frameBuffer=gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER,frameBuffer);
      gl.bufferData(gl.ARRAY_BUFFER,frames,gl.STATIC_DRAW);
      ['tangent','bitangent'].forEach((name,i) => {
        const index=gl.getAttribLocation(program,name);
        gl.enableVertexAttribArray(index);
        gl.vertexAttribPointer(index,3,gl.SHORT,true,12,i*6);
      });
    }
    const uniforms = ['right','up','front','target','focalLength','cameraDistance','eye','studioRotation'];
    const [right,up,front,target,focalLength,distance,eye,studioRotation] = uniforms.map(name => gl.getUniformLocation(program,name));
    const maps = [
      ['texture','diffuse','hasDiffuse'], ['normalMap','normalMap','hasNormal'],
      ['ormMap','ormMap','hasOrm'], ['scatteringMap','scatteringMap','hasScattering']
    ].map(([key,sampler,enabled],index) => {
      gl.uniform1i(gl.getUniformLocation(program,sampler),index);
      return {key, slot:gl.TEXTURE0+index, enabled:gl.getUniformLocation(program,enabled)};
    });
    const glassSide = gl.getUniformLocation(program,'glassSide');
    const textures = new Map();
    function upload(width,height,pixels) {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      const mipmaps = (width & (width-1)) === 0 && (height & (height-1)) === 0;
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      if (mipmaps) gl.generateMipmap(gl.TEXTURE_2D);
      return texture;
    }
    const whiteTexture=upload(1,1,new Uint8Array([255,255,255,255]));
    gl.activeTexture(gl.TEXTURE0+4);
    const studioTexture=upload(128,448,probe);
    gl.uniform1i(gl.getUniformLocation(program,'studioProbe'),4);
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0,0,0,0);
    return {
      draw(camera) {
        gl.viewport(0,0,canvas.width,canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
        gl.uniform3fv(right,camera.right);
        gl.uniform3fv(up,camera.up);
        gl.uniform3fv(front,camera.front);
        gl.uniform3fv(target,camera.target);
        gl.uniform1f(distance,camera.distance);
        gl.uniform3fv(eye,camera.target.map((value,i) => value+camera.distance*camera.front[i]));
        gl.uniform2f(focalLength,2*camera.focalLength/canvas.width,2*camera.focalLength/canvas.height);
        const lightAngle=camera.lightAngle || 0;
        gl.uniform2f(studioRotation,Math.cos(lightAngle),Math.sin(lightAngle));
        let blending = false;
        for (const group of materialPasses(groups,camera.front)) {
          if (group.side && !blending) {
            gl.enable(gl.BLEND);
            gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
            gl.depthMask(false);
            blending = true;
          }
          gl.uniform1i(glassSide,group.side || 0);
          for (const {key,slot,enabled} of maps) {
            const uri=group[key], bitmap=camera.images.get(uri);
            gl.activeTexture(slot);
            if (bitmap && !textures.has(uri)) {
              const pixels=new Uint8Array(bitmap.data.buffer,bitmap.data.byteOffset,bitmap.data.byteLength);
              textures.set(uri,upload(bitmap.width,bitmap.height,pixels));
            }
            gl.bindTexture(gl.TEXTURE_2D,textures.get(uri) || whiteTexture);
            gl.uniform1i(enabled,bitmap ? 1 : 0);
          }
          gl.drawArrays(gl.TRIANGLES,group.first,group.count);
        }
        if (blending) {
          gl.disable(gl.BLEND);
          gl.depthMask(true);
        }
      },
      close() {
        gl.deleteTexture(whiteTexture);
        gl.deleteTexture(studioTexture);
        textures.forEach(t=>gl.deleteTexture(t));
        gl.deleteBuffer(buffer);
        if (frameBuffer) gl.deleteBuffer(frameBuffer);
        gl.deleteProgram(program);
        resources.forEach(s => gl.deleteShader(s));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
    };
  }
  // Clip camera-space position and interpolants before the perspective divide.
  function clipNear(vertices) {
    const inside = v => v[2] >= near;
    if (vertices.every(inside)) return vertices;
    const clipped = [];
    let from = vertices[vertices.length - 1];
    for (const to of vertices) {
      if (inside(from) !== inside(to)) {
        const fraction = (near - from[2]) / (to[2] - from[2]);
        const edge = from.map((v,k) => v + fraction*(to[k] - v));
        edge[2] = near;
        clipped.push(edge);
      }
      if (inside(to)) clipped.push(to);
      from = to;
    }
    return clipped;
  }
  const probeLinear = Float32Array.from(probe, v => 2 ** (v/32) - 1);
  const softwareTransmission=[.50,.18,.09], softwareSkinTint=[1,.43,.25], softwareKeyTint=[1.19,1.10,1];
  function softwareStudio({right,up,front,lightAngle=0}) {
    const cos=Math.cos(lightAngle), sin=Math.sin(lightAngle);
    function localDirection([x,y,z]) {
      const rotated=[cos*x-sin*y,sin*x+cos*y,z];
      return [dot(rotated,right),dot(rotated,up),dot(rotated,front)];
    }
    return {x:localDirection([1,0,0]), y:localDirection([0,1,0]), z:localDirection([0,0,1]),
      key:localDirection(unit([-.42,-.69,.59]))};
  }
  function sampleProbe(studio, direction, level) {
    const x=clamp((Math.atan2(dot(direction,studio.y),dot(direction,studio.x))/(2*Math.PI)+.5)*128-.5,0,127);
    const y=clamp(Math.acos(clamp(dot(direction,studio.z),-1,1))/Math.PI*64-.5,0,63);
    const a=Math.floor(x), b=Math.floor(y), fx=x-a, fy=y-b;
    function slice(k,ch) {
      const pos=(k*64+b)*512+a*4+ch;
      const dx=a<127 ? 4 : 0, dy=b<63 ? 512 : 0;
      return (1-fy)*((1-fx)*probeLinear[pos]+fx*probeLinear[pos+dx])+
        fy*((1-fx)*probeLinear[pos+dy]+fx*probeLinear[pos+dy+dx]);
    }
    const lo=Math.floor(level), mix=level-lo;
    return [0,1,2].map(ch => mix ? (1-mix)*slice(lo,ch)+mix*slice(lo+1,ch) : slice(lo,ch));
  }
  function softwareLinearize(value) {
    return value<=.04045 ? value/12.92 : ((value+.055)/1.055)**2.4;
  }
  function shadeSoftware(studio,n,v,base,occlusion,roughness,metallic,scattering,pixels,offset) {
    roughness=clamp(roughness,.09,1);
    const key=studio.key;
    const rawNV=dot(n,v), nv=Math.max(rawNV,0);
    const irradianceRGB=sampleProbe(studio,n,6);
    const backRGB=scattering ? sampleProbe(studio,[-n[0],-n[1],-n[2]],6) : null;
    const reflectionRGB=sampleProbe(studio,[2*rawNV*n[0]-v[0],2*rawNV*n[1]-v[1],2*rawNV*n[2]-v[2]],roughness*5);
    const rx=1-roughness;
    const a004=Math.min(rx*rx,2**(-9.28*nv))*rx+.0425-roughness*.0275;
    const brdfX=-1.04*a004+1.04-roughness*.572, brdfY=1.04*a004-.04+roughness*.022;
    const specularOcclusion=occlusion===1 ? 1 : clamp((nv+occlusion)**(2**(-16*roughness-1))-1+occlusion,0,1);
    const nDotKey=dot(n,key);
    const hx=v[0]+key[0], hy=v[1]+key[1], hz=v[2]+key[2];
    const halfScale=1/Math.sqrt(hx*hx+hy*hy+hz*hz || 1);
    const nl=Math.max(nDotKey,0), directNV=Math.max(nv,.001);
    const nh=Math.max((n[0]*hx+n[1]*hy+n[2]*hz)*halfScale,0);
    const vh=clamp((v[0]*hx+v[1]*hy+v[2]*hz)*halfScale,0,1);
    const alpha2=roughness**4, d=1+nh*nh*(alpha2-1);
    const distribution=alpha2/Math.max(Math.PI*d*d,.00001);
    const gv=nl*Math.sqrt(directNV*directNV*(1-alpha2)+alpha2);
    const gl=directNV*Math.sqrt(nl*nl*(1-alpha2)+alpha2);
    const visibility=.5/Math.max(gv+gl,.001);
    const fresnelWeight=(1-vh)**5, directSpecular=distribution*visibility*nl;
    const wrap=Math.max((nDotKey+.4)/1.4,0)-nl;
    const skinWeight=scattering*.46;
    for(let ch=0;ch<3;ch++){
      const f0=.04+(base[ch]-.04)*metallic;
      const diffuseColor=base[ch]*(1-metallic);
      const irradiance=.08+.80*irradianceRGB[ch];
      let indirectDiffuse=irradiance;
      if (backRGB) {
        const transmission=.08+.80*backRGB[ch];
        indirectDiffuse+=skinWeight*(transmission*softwareTransmission[ch]-.05*irradiance);
      }
      indirectDiffuse*=diffuseColor*(1-f0)*occlusion;
      const reflection=reflectionRGB[ch]*.85;
      const indirectSpecular=reflection*Math.max(f0*brdfX+brdfY,0)*specularOcclusion;
      const fresnel=f0+(1-f0)*fresnelWeight;
      const direct=softwareKeyTint[ch]*((1-fresnel)*diffuseColor*(nl/Math.PI)+fresnel*directSpecular+
        diffuseColor*softwareSkinTint[ch]*wrap*skinWeight);
      const lit=Math.max(0,(indirectDiffuse+indirectSpecular+direct)*.85);
      const tone=clamp(lit*(2.51*lit+.03)/(lit*(2.43*lit+.59)+.14),0,1);
      pixels[offset+ch]=255*(tone<=.0031308 ? 12.92*tone : 1.055*tone**(1/2.4)-.055);
    }
  }
  function sampleSoftwareTexture(bitmap, u, v, out) {
    const {width,height,data}=bitmap;
    const x=u*width-.5, y=v*height-.5;
    const left=Math.floor(x), top=Math.floor(y);
    const fx=x-left, fy=y-top;
    const x0=clamp(left,0,width-1), x1=clamp(left+1,0,width-1);
    const y0=clamp(top,0,height-1)*width, y1=clamp(top+1,0,height-1)*width;
    const aa=(y0+x0)*4, ab=(y0+x1)*4, ba=(y1+x0)*4, bb=(y1+x1)*4;
    for(let ch=0;ch<out.length;ch++) {
      const a=data[aa+ch]+fx*(data[ab+ch]-data[aa+ch]);
      const b=data[ba+ch]+fx*(data[bb+ch]-data[ba+ch]);
      out[ch]=(a+fy*(b-a))/255;
    }
  }
  function softwareRenderer(canvas, {data, frames, groups}) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const texColor=new Float32Array(4), texNormal=new Float32Array(3);
    const texORM=new Float32Array(3), texScattering=new Float32Array(1);
    const surfaceNormal=new Float32Array(3), viewDirection=new Float32Array(3), base=new Float32Array(3);
    const glassColor = new Uint8ClampedArray(3);
    let image, depth;
    return {
      draw(camera) {
        const w=canvas.width, h=canvas.height;
        if (!image || image.width!==w || image.height!==h) {
          image=ctx.createImageData(w,h);
          depth=new Float64Array(w*h);
        }
        depth.fill(0);
        image.data.fill(0);
        const {right,up,front,target,distance,focalLength}=camera;
        const studio=softwareStudio(camera);
        function vertex(i) {
          const px=data[i]-target[0], py=data[i+1]-target[1], pz=data[i+2]-target[2];
          const nx=data[i+3], ny=data[i+4], nz=data[i+5];
          return [
            px*right[0]+py*right[1]+pz*right[2],
            px*up[0]+py*up[1]+pz*up[2],
            distance-(px*front[0]+py*front[1]+pz*front[2]),data[i+9],data[i+10],
            nx*right[0]+ny*right[1]+nz*right[2],
            nx*up[0]+ny*up[1]+nz*up[2],
            nx*front[0]+ny*front[1]+nz*front[2]
          ];
        }
        function project(v) {
          const reciprocalDepth=1/v[2], scale=focalLength*reciprocalDepth;
          return [w*.5+v[0]*scale,h*.5-v[1]*scale,reciprocalDepth,
            v[3]*reciprocalDepth,v[4]*reciprocalDepth,v[5]*reciprocalDepth,
            v[6]*reciprocalDepth,v[7]*reciprocalDepth];
        }
        function rasterize(a,b,c,i,material,frame) {
          const dx1=b[0]-a[0],dy1=b[1]-a[1],dx2=c[0]-a[0],dy2=c[1]-a[1];
          const den=dx1*dy2-dx2*dy1;
          if (Math.abs(den)<1e-6) return;
          const facing=den<0 ? 1 : -1, invDen=1/den;
          if (material.side && facing!==material.side) return;
          const x0=clamp(Math.floor(Math.min(a[0],b[0],c[0])),0,w);
          const x1=clamp(Math.ceil(Math.max(a[0],b[0],c[0])),0,w);
          const y0=clamp(Math.floor(Math.min(a[1],b[1],c[1])),0,h);
          const y1=clamp(Math.ceil(Math.max(a[1],b[1],c[1])),0,h);
          const {diffuse,normalMap,ormMap,scatteringMap}=material;
          const mappedNormal=frame && normalMap;
          const hasMaps=diffuse || mappedNormal || ormMap || scatteringMap;
          for (let y=y0;y<y1;y++) {
            for (let x=x0;x<x1;x++) {
              const dx=x+.5-a[0],dy=y+.5-a[1];
              const u=(dx*dy2-dy*dx2)*invDen,v=(dy*dx1-dx*dy1)*invDen;
              const t=1-u-v;
              if (u<0 || v<0 || t<0) continue;
              const z=t*a[2]+u*b[2]+v*c[2], p=y*w+x;
              if (z<=depth[p]) continue;
              const invZ=1/z;
              let tu=0,tv=0;
              base[0]=data[i+6]; base[1]=data[i+7]; base[2]=data[i+8];
              if (hasMaps) {
                tu=(t*a[3]+u*b[3]+v*c[3])*invZ;
                tv=(t*a[4]+u*b[4]+v*c[4])*invZ;
                tu-=Math.floor(tu);
                tv=1-(tv-Math.floor(tv));
              }
              if (diffuse) {
                sampleSoftwareTexture(diffuse,tu,tv,texColor);
                if (!material.side && texColor[3]<.5) continue;
                for (let ch=0;ch<3;ch++) base[ch]=softwareLinearize(texColor[ch]);
              }
              let nx=t*a[5]+u*b[5]+v*c[5], ny=t*a[6]+u*b[6]+v*c[6], nz=t*a[7]+u*b[7]+v*c[7];
              const normalScale=1/Math.sqrt(nx*nx+ny*ny+nz*nz || 1);
              nx*=normalScale; ny*=normalScale; nz*=normalScale;
              if (mappedNormal) {
                sampleSoftwareTexture(mappedNormal,tu,tv,texNormal);
                const {tangent,bitangent}=frame;
                const projection=tangent[0]*nx+tangent[1]*ny+tangent[2]*nz;
                let tx=tangent[0]-projection*nx, ty=tangent[1]-projection*ny, tz=tangent[2]-projection*nz;
                const tangentScale=1/Math.sqrt(tx*tx+ty*ty+tz*tz || 1);
                tx*=tangentScale; ty*=tangentScale; tz*=tangentScale;
                const bx=ny*tz-nz*ty, by=nz*tx-nx*tz, bz=nx*ty-ny*tx;
                const handedness=bx*bitangent[0]+by*bitangent[1]+bz*bitangent[2]<0 ? -1 : 1;
                const normalX=2*texNormal[0]-1, normalY=(1-2*texNormal[1])*handedness;
                const normalZ=2*texNormal[2]-1;
                nx=nx*normalZ+tx*normalX+bx*normalY;
                ny=ny*normalZ+ty*normalX+by*normalY;
                nz=nz*normalZ+tz*normalX+bz*normalY;
                const mappedScale=1/Math.sqrt(nx*nx+ny*ny+nz*nz || 1);
                nx*=mappedScale; ny*=mappedScale; nz*=mappedScale;
              }
              let occlusion=1,roughness=.55,metallic=0,scattering=0;
              if (ormMap) {
                sampleSoftwareTexture(ormMap,tu,tv,texORM);
                occlusion=texORM[0]; roughness=texORM[1]; metallic=texORM[2];
              }
              if (scatteringMap) {
                sampleSoftwareTexture(scatteringMap,tu,tv,texScattering);
                scattering=texScattering[0];
              }
              const vx=(w*.5-x-.5)/focalLength, vy=(y+.5-h*.5)/focalLength;
              const viewScale=1/Math.sqrt(vx*vx+vy*vy+1);
              viewDirection[0]=vx*viewScale;
              viewDirection[1]=vy*viewScale;
              viewDirection[2]=viewScale;
              surfaceNormal[0]=nx*facing; surfaceNormal[1]=ny*facing; surfaceNormal[2]=nz*facing;
              const pixel=p*4;
              if (material.side) {
                shadeSoftware(studio,surfaceNormal,viewDirection,base,
                  occlusion,roughness,metallic,scattering,glassColor,0);
                const opacity=diffuse ? texColor[3] : 1;
                const behind=(1-opacity)*image.data[pixel+3]/255;
                const combined=opacity+behind;
                if (!combined) continue;
                for (let ch=0;ch<3;ch++) {
                  image.data[pixel+ch]=(glassColor[ch]*opacity+image.data[pixel+ch]*behind)/combined;
                }
                image.data[pixel+3]=combined*255;
              } else {
                shadeSoftware(studio,surfaceNormal,viewDirection,base,
                  occlusion,roughness,metallic,scattering,image.data,pixel);
                depth[p]=z;
                image.data[pixel+3]=255;
              }
            }
          }
        }
        for (const group of materialPasses(groups,front)) {
          const material={
            side:group.side,
            diffuse:camera.images.get(group.texture),
            normalMap:camera.images.get(group.normalMap),
            ormMap:camera.images.get(group.ormMap),
            scatteringMap:camera.images.get(group.scatteringMap)
          };
          for (let i=group.first*11;i<(group.first+group.count)*11;i+=33) {
            const vertices=[vertex(i),vertex(i+11),vertex(i+22)];
            const projected=clipNear(vertices).map(project);
            if (projected.length<3) continue;
            let tangent;
            if (material.normalMap && frames) {
              const start=i/11*6;
              const t=frames.subarray(start,start+3), b=frames.subarray(start+3,start+6);
              if (t[0] || t[1] || t[2]) {
                const cameraAxes = direction => [dot(direction,right),dot(direction,up),dot(direction,front)];
                tangent={tangent:cameraAxes(t),bitangent:cameraAxes(b)};
              }
            }
            for (let j=1;j+1<projected.length;j++) {
              rasterize(projected[0],projected[j],projected[j+1],i,material,tangent);
            }
          }
        }
        ctx.putImageData(image,0,0);
      },
      close() { image=null; depth=null; }
    };
  }
  window.mountPortfolioScene = function(container, lang, options) {
    const pick = (ko,en) => lang === 'en' ? en : ko;
    const figure = document.createElement('figure');
    figure.className = 'arkaden-view';
    const style = document.createElement('style');
    style.textContent = css;
    let canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label',options.title);
    const caption = document.createElement('figcaption'), hint = document.createElement('small');
    const controls = document.createElement('span');
    controls.className = 'arkaden-tools';
    const instructions = () => pick('왼쪽·가운데 버튼 드래그로 회전 · Shift+드래그로 이동 · 클릭 후 휠로 확대/축소 · 두 손가락으로 이동/확대','Drag with left or middle button to orbit · Shift-drag to pan · Click then scroll to zoom · Use two fingers to pan and pinch');
    hint.textContent = instructions();
    caption.append(hint,controls);
    figure.append(style,canvas,caption);
    container.append(figure);
    const geometry = options.geometry && readScene(options.geometry);
    let renderer, software = false;
    if (geometry) {
      try { renderer = webglRenderer(canvas,geometry); }
      catch {
        const replacement = canvas.cloneNode();
        canvas.replaceWith(replacement);
        canvas = replacement;
      }
      if (!renderer) { renderer = softwareRenderer(canvas,geometry); software = true; }
    }
    if (!renderer) {
      if (options.onError) {
        figure.remove();
        throw Error('3D renderer unavailable');
      }
      hint.textContent = pick('이 기기에서는 3D 장면을 표시할 수 없습니다.','The 3D view is unavailable on this device.');
      canvas.hidden = true;
      return () => figure.remove();
    }
    const home = {yaw: options.yaw ?? .43, pitch: options.pitch ?? .48, zoom:1};
    const frame = frameGeometry(geometry.data,axes(home.yaw,home.pitch));
    const state = {...home,lightAngle:0,target:[...frame.target]};
    const images = new Map(), pointers = new Map();
    const textureUris = new Set(geometry.groups.flatMap(g => [g.texture,g.normalMap,g.ormMap,g.scatteringMap]).filter(Boolean));
    let pending = 0, disposed = false, ready = false;
    options.onProgress?.(0,textureUris.size);
    function draw() {
      pending = 0;
      const displayWidth = canvas.clientWidth, displayHeight = canvas.clientHeight;
      if (!displayWidth || !displayHeight) return;
      const ratio = software ? Math.min(1,580/displayWidth) : Math.min(window.devicePixelRatio||1,2,1800/displayWidth);
      const w = Math.max(1,Math.round(displayWidth*ratio)), h = Math.max(1,Math.round(displayHeight*ratio));
      if(canvas.width!==w) canvas.width=w;
      if(canvas.height!==h) canvas.height=h;
      const basis = axes(state.yaw,state.pitch);
      try {
        renderer.draw({...basis,lightAngle:state.lightAngle,target:state.target,distance:frame.distance,
          focalLength:frame.distance*Math.min(w/frame.width,h/frame.height)*state.zoom,images});
      } catch (cause) {
        if (!options.onError) throw cause;
        options.onError(cause);
        return;
      }
      if (!ready && images.size === textureUris.size) {
        ready = true;
        options.onReady?.();
      }
    }
    function redraw() { if(!pending && !disposed) pending=requestAnimationFrame(draw); }
    function zoom(factor) { state.zoom=clamp(state.zoom*factor,.25,12); redraw(); }
    function orbit(dx,dy) { state.yaw-=dx*.008; state.pitch=clamp(state.pitch+dy*.007,-1.55,1.55); redraw(); }
    function pan(dx,dy) {
      const units = 1 / (Math.min(canvas.clientWidth/frame.width,canvas.clientHeight/frame.height)*state.zoom);
      const {right,up}=axes(state.yaw,state.pitch);
      state.target = state.target.map((v,i)=>v+(-dx*right[i]+dy*up[i])*units);
      redraw();
    }
    function reset() {Object.assign(state,home);state.lightAngle=0;angleControl.value="0";state.target=[...frame.target];redraw();}
    function button(name,short,fn) {
      const b=document.createElement('button');
      b.type='button'; b.setAttribute('aria-label',name); b.textContent=short; b.addEventListener('click',fn); controls.append(b); return b;
    }
    const minus=button(pick('축소','Zoom out'),'−',()=>zoom(1/1.23));
    const plus=button(pick('확대','Zoom in'),'+',()=>zoom(1.23));
    const resetButton=button(pick('처음 시점','Reset view'),pick('처음 시점','Reset'),reset);
    const angleLabel = document.createElement('label');
    angleLabel.className = 'lighting-angle';
    const angleTitle = document.createElement('span');
    const angleControl = document.createElement('input');
    angleControl.type = 'range';
    angleControl.min = '-180';
    angleControl.max = '180';
    angleControl.value = '0';
    angleControl.addEventListener('input', () => {
      state.lightAngle = Number(angleControl.value) * Math.PI / 180;
      redraw();
    });
    angleTitle.textContent = pick('조명 회전','Rotate lighting');
    angleLabel.append(angleTitle,angleControl);
    controls.append(angleLabel);
    function localize() {
      angleTitle.textContent = document.documentElement.lang === 'en' ? 'Rotate lighting' : '조명 회전';
      lang = document.documentElement.lang;
      hint.textContent = instructions();
      minus.setAttribute('aria-label',pick('축소','Zoom out'));
      plus.setAttribute('aria-label',pick('확대','Zoom in'));
      resetButton.setAttribute('aria-label',pick('처음 시점','Reset view'));
      resetButton.textContent=pick('처음 시점','Reset');
    }
    document.addEventListener('portfolio-language',localize);
    for (const texture of textureUris) {
      const image = new Image();
      image.onload = () => {
        if(disposed) return;
        try {
          const buffer = document.createElement('canvas');
          buffer.width=image.naturalWidth; buffer.height=image.naturalHeight;
          const ctx = buffer.getContext('2d');
          if (!ctx) throw Error('Texture canvas unavailable');
          ctx.drawImage(image,0,0);
          images.set(texture,ctx.getImageData(0,0,buffer.width,buffer.height));
          options.onProgress?.(images.size,textureUris.size);
          redraw();
        } catch (cause) {
          options.onError?.(cause);
        }
      };
      image.onerror = () => { if (!disposed) options.onError?.(new Error('Could not load model texture')); };
      image.src=texture;
    }
    canvas.addEventListener('pointerdown',e=>{
      if(e.button!==0 && e.button!==1 && e.button!==2) return;
      e.preventDefault(); canvas.focus({preventScroll:true}); canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,button:e.button});
    });
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    canvas.addEventListener('pointermove',e=>{
      const old=pointers.get(e.pointerId);
      if (!old) return;
      const dx=e.clientX-old.x,dy=e.clientY-old.y;
      const other=[...pointers.entries()].find(([id])=>id!==e.pointerId)?.[1];
      if (other && pointers.size===2) {
        const before=Math.hypot(old.x-other.x,old.y-other.y);
        const after=Math.hypot(e.clientX-other.x,e.clientY-other.y);
        if(before>1 && after>1) zoom(after/before);
        pan(dx/2,dy/2);
      } else if (pointers.size===1) {
        if(e.shiftKey || old.button===2) pan(dx,dy);
        else orbit(dx,dy);
      }
      old.x=e.clientX; old.y=e.clientY;
    });
    for(const type of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(type,e=>pointers.delete(e.pointerId));
    canvas.addEventListener('wheel',e=>{
      if(document.activeElement!==canvas) return;
      e.preventDefault();
      zoom(Math.exp(-clamp(e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?canvas.clientHeight:1),-220,220)*.0025));
    },{passive:false});
    canvas.addEventListener('keydown',e=>{
      const delta={ArrowLeft:[-18,0],ArrowRight:[18,0],ArrowUp:[0,18],ArrowDown:[0,-18]}[e.key];
      if(delta) (e.shiftKey?pan:orbit)(...delta);
      else if(e.key==='+' || e.key==='=') zoom(1.23);
      else if(e.key==='-') zoom(1/1.23);
      else if(e.key==='Home') reset();
      else return;
      e.preventDefault(); e.stopPropagation();
    });
    const observer=new ResizeObserver(redraw); observer.observe(canvas); redraw();
    return ()=>{disposed=true;document.removeEventListener('portfolio-language',localize);observer.disconnect();cancelAnimationFrame(pending);renderer.close();figure.remove();};
  };
  window.mountArkaden=(container,lang)=>window.mountPortfolioScene(container,lang,{geometry:window.arkadenGeometry,title:'Arkaden',pitch:.72});
})();
