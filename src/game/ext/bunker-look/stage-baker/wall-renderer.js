// Host adaptation of the supplied SDK: the ordinary colour pass is unchanged.
// semanticPass only emits geometry IDs for native floor/wall/lip staging; original vendor files remain preserved.
// Vertical soil faces for the continuous bunker terrain. Uses texture unit 4.
const VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec2 aUV;
layout(location=2) in vec2 aNormal;
layout(location=3) in float aHeight;
out vec2 vUV;
out vec2 vNormal;
out float vHeight;
void main() {
  gl_Position = vec4(aPosition, 1.);
  vUV = aUV;
  vNormal = aNormal;
  vHeight = aHeight;
}`;
const FS = `#version 300 es
precision highp float;
in vec2 vUV;
in vec2 vNormal;
in float vHeight;
uniform sampler2D uEarth;
uniform float uShadow;
uniform int uSemantic;
out vec4 outColor;
void main() {
  if(uSemantic==1){outColor=vec4(0.,1.,0.,1.);return;}
  vec3 source = texture(uEarth, vUV).rgb;
  // The supplied earth is already brown; preserve its stones, roots and colour.
  vec3 earth = pow(max(source, vec3(.001)), vec3(.94)) * vec3(1.025, 1., .96);
  vec3 normal = normalize(vec3(vNormal, 0.));
  vec3 light = normalize(vec3(.65, -.9, .52));
  float directional = .28 + .74 * max(dot(normal, light), 0.);
  float strength = clamp(uShadow / 1.5, 0., 1.7);
  float shade = mix(.95, directional, min(strength, 1.));
  float overhang = smoothstep(.8, 1., vHeight);
  float contact = 1. - smoothstep(0., .18, vHeight);
  shade *= max(.62, 1. - strength * (.18 * overhang + .14 * contact));
  outColor = vec4(earth * shade, 1.);
}`;
function shader(gl, type, source) {
  const result = gl.createShader(type);
  gl.shaderSource(result, source);
  gl.compileShader(result);
  if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(result);
    gl.deleteShader(result);
    throw new Error('Wall shader: ' + message);
  }
  return result;
}

export class WallRenderer {
  // Host: the wall picture comes per bake (options.textures.wall, options.wallAspect = its width / height).
  constructor(gl) {
    this.gl = gl;
    const vertex = shader(gl, gl.VERTEX_SHADER, VS);
    const fragment = shader(gl, gl.FRAGMENT_SHADER, FS);
    const program = this.program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error('Wall program: ' + gl.getProgramInfoLog(program));
    }
    this.earthUniform = gl.getUniformLocation(program, 'uEarth');
    this.shadowUniform = gl.getUniformLocation(program, 'uShadow');
    this.semanticUniform = gl.getUniformLocation(program, 'uSemantic');
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    for (const [location, size, offset] of [[0,3,0], [1,2,12], [2,2,20], [3,1,28]]) {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 32, offset);
    }
    gl.bindVertexArray(null);
  }

  draw({terrain, depth, scale, origin, options = {}, width, height, heightAt}) {
    const P=options.projection??{halfWidth:256,halfHeight:148,verticalPixelsPerMetre:147.8};
    if (!terrain?.contours?.length || (options.wall ?? .25) <= 0) return 0;
    if (typeof heightAt !== 'function') throw new TypeError('WallRenderer.draw requires heightAt(d, depth, options).');
    const top = heightAt(-.012, depth, options);
    const bottom = heightAt(.012, depth, options);
    if (!Number.isFinite(top) || !Number.isFinite(bottom)) throw new TypeError('Wall profile heights must be finite.');
    if (top <= bottom + .000001) return 0;
    const textureScale = Math.max(.01, options.textureScale ?? 1);
    const earthScale = Math.max(.01, options.earthScale ?? 1);
    const textureSize = textureScale * earthScale;
    const data = [];
    const normalAt = (x, y, fallback) => {
      const e = .012;
      let nx = terrain.sample(x + e, y) - terrain.sample(x - e, y);
      let ny = terrain.sample(x, y + e) - terrain.sample(x, y - e);
      let length = Math.hypot(nx, ny);
      if (length < 1e-8) {
        [nx, ny] = fallback;
        length = Math.hypot(nx, ny) || 1;
        if (terrain.sample(x + nx / length * e, y + ny / length * e) <
            terrain.sample(x - nx / length * e, y - ny / length * e)) {
          nx = -nx;
          ny = -ny;
        }
      }
      return [nx / length, ny / length];
    };
    const emit = (point, z, u, normal, level) => {
      const [x, y] = point;
      const px = origin.x + (x - y) * P.halfWidth * scale;
      const py = origin.y + (x + y) * P.halfHeight * scale - z * P.verticalPixelsPerMetre * scale;
      data.push(px / (width / 2) - 1, 1 - py / (height / 2),
        -(2 * (x + y) + z) * (options.depthScale ?? .01) - .000002,
        u, (z - bottom) / (1.2 * textureSize), normal[0], normal[1], level);
    };
    for (const path of terrain.contours) {
      if (path.length < 3) continue;
      const last = path[path.length - 1];
      const closed = Math.hypot(path[0][0] - last[0], path[0][1] - last[1]) < 1e-8;
      const count = closed ? path.length - 1 : path.length;
      const lengths = [];
      let total = 0;
      for (let i = 0; i < count; i++) {
        const a = path[i], b = path[(i + 1) % count];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        lengths.push(length);
        total += length;
      }
      if (total < 1e-8) continue;
      // The broad source covers about ten ground metres (five grid units).
      // Larger controls enlarge its grain; whole repeats close the loop UV.
      const repeats = Math.max(1, Math.round(total / (.6 * (options.wallAspect ?? 1) * textureSize)));
      let distance = 0;
      for (let i = 0; i < count; i++) {
        const a = path[i], b = path[(i + 1) % count];
        const length = lengths[i];
        if (length < 1e-8) continue;
        const fallback = [-(b[1] - a[1]), b[0] - a[0]];
        const na = normalAt(a[0], a[1], fallback);
        const nb = normalAt(b[0], b[1], fallback);
        const ua = distance / total * repeats;
        const ub = (distance + length) / total * repeats;
        emit(a, top, ua, na, 1); emit(a, bottom, ua, na, 0); emit(b, bottom, ub, nb, 0);
        emit(a, top, ua, na, 1); emit(b, bottom, ub, nb, 0); emit(b, top, ub, nb, 1);
        distance += length;
      }
    }
    if (!data.length) return 0;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STREAM_DRAW);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, options.textures.wall);
    gl.uniform1i(this.earthUniform, 4);
    gl.uniform1f(this.shadowUniform, options.shadow ?? 1.5);
    gl.uniform1i(this.semanticUniform, options.semanticPass ? 1 : 0);
    gl.viewport(0, 0, width, height);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    const vertices = data.length / 8;
    gl.drawArrays(gl.TRIANGLES, 0, vertices);
    return vertices;
  }
}

