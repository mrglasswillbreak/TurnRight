import type { CustomLayerInterface, Map as MapInstance } from 'maplibre-gl';

export const spaceOpacity = (zoom: number) =>
  Math.max(0, Math.min(1, (6 - zoom) / 2));

/** Seeded, uniform directions on a sphere. A decorative sky, not a catalogue. */
export function starField(count = 6144) {
  let seed = 0x51a7f13d;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const points = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const y = random() * 2 - 1,
      angle = random() * Math.PI * 2;
    const radius = Math.sqrt(1 - y * y);
    points.set(
      [
        radius * Math.cos(angle),
        y,
        radius * Math.sin(angle),
        0.42 + random() ** 2 * 0.58,
      ],
      i * 4,
    );
  }
  return points;
}

/** One layer, the map's existing context, no timer or extra canvas. Far-depth
 * fragments fail against the opaque globe; clouds and labels draw after us.
 */
export function worldStars(
  enabled: () => boolean,
  failed: (value: boolean) => void,
): CustomLayerInterface {
  let map: MapInstance;
  let buffer: WebGLBuffer | null = null,
    vao: WebGLVertexArrayObject | null = null;
  let stars: WebGLProgram | null = null,
    space: WebGLProgram | null = null;
  let unavailable = false;
  const points = starField();
  function program(
    gl: WebGL2RenderingContext,
    vertex: string,
    fragment: string,
  ) {
    const shaders: WebGLShader[] = [];
    const p = gl.createProgram();
    if (!p) throw Error('Star program unavailable');
    try {
      for (const [type, source] of [
        [gl.VERTEX_SHADER, vertex],
        [gl.FRAGMENT_SHADER, fragment],
      ] as const) {
        const shader = gl.createShader(type);
        if (!shader) throw Error('Star shader unavailable');
        shaders.push(shader);
        gl.shaderSource(
          shader,
          '#version 300 es\nprecision highp float;\n' + source,
        );
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw Error(gl.getShaderInfoLog(shader) || 'Star shader failed');
        gl.attachShader(p, shader);
      }
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS))
        throw Error('Star program failed');
      return p;
    } catch (error) {
      gl.deleteProgram(p);
      throw error;
    } finally {
      for (const shader of shaders) gl.deleteShader(shader);
    }
  }
  const lost = () => {
    buffer = null;
    vao = null;
    stars = null;
    space = null;
  };
  const restored = () => {
    lost();
    unavailable = false;
    failed(false);
    map.triggerRepaint();
  };
  function dispose(gl: WebGL2RenderingContext) {
    gl.deleteBuffer(buffer);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(stars);
    gl.deleteProgram(space);
    lost();
  }
  return {
    id: 'world-stars',
    type: 'custom',
    renderingMode: '2d',
    onAdd(value) {
      map = value;
      map.on('webglcontextlost', lost);
      map.on('webglcontextrestored', restored);
    },
    render(gl, input) {
      const opacity = spaceOpacity(map.getZoom());
      if (
        unavailable ||
        gl.isContextLost() ||
        !opacity ||
        input.defaultProjectionData.projectionTransition < 0.99
      )
        return;
      const oldVao = gl.getParameter(
        gl.VERTEX_ARRAY_BINDING,
      ) as WebGLVertexArrayObject | null;
      try {
        if (!space)
          space = program(
            gl,
            `
          void main() {
            vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
            gl_Position = vec4(p * 2.0 - 1.0, 1.0, 1.0);
          }`,
            `uniform float u_opacity; out vec4 colour;
          void main() { colour = vec4(vec3(8.0,15.0,32.0)/255.0*u_opacity, u_opacity); }`,
          );
        if (!stars)
          stars = program(
            gl,
            `
          layout(location=0) in vec4 a_star;
          uniform mat4 u_matrix; uniform float u_pixel_ratio;
          out float v_brightness;
          void main() {
            // w=0 removes ALL camera translation. The public projection matrix
            // supplies current longitude, latitude, bearing, pitch and roll.
            vec4 clip = u_matrix * vec4(a_star.xyz, 0.0);
            gl_Position = clip.w > 0.0 ? vec4(clip.xy, clip.w, clip.w) : vec4(2.0,2.0,1.0,1.0);
            gl_PointSize = (1.4 + a_star.w * 1.7) * u_pixel_ratio;
            v_brightness = a_star.w;
          }`,
            `in float v_brightness; uniform float u_opacity; out vec4 colour;
          void main() {
            float alpha = (1.0 - smoothstep(0.15,0.5,length(gl_PointCoord-0.5))) * v_brightness * u_opacity;
            colour = vec4(vec3(0.81,0.87,1.0)*alpha,alpha);
          }`,
          );
        if (!vao) {
          vao = gl.createVertexArray();
          buffer = gl.createBuffer();
          if (!vao || !buffer) throw Error('Star buffers unavailable');
          gl.bindVertexArray(vao);
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW);
          gl.enableVertexAttribArray(0);
          gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
        }
        gl.bindVertexArray(vao);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(false);
        gl.depthRange(0, 1);
        gl.disable(gl.STENCIL_TEST);
        gl.disable(gl.CULL_FACE);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(space);
        gl.uniform1f(gl.getUniformLocation(space, 'u_opacity'), opacity);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        if (enabled()) {
          gl.useProgram(stars);
          gl.uniform1f(gl.getUniformLocation(stars, 'u_opacity'), opacity);
          gl.uniform1f(
            gl.getUniformLocation(stars, 'u_pixel_ratio'),
            map.getCanvas().width / map.getContainer().clientWidth,
          );
          gl.uniformMatrix4fv(
            gl.getUniformLocation(stars, 'u_matrix'),
            false,
            input.defaultProjectionData.mainMatrix,
          );
          gl.drawArrays(gl.POINTS, 0, points.length / 4);
        }
      } catch {
        dispose(gl);
        unavailable = true;
        queueMicrotask(() => failed(true));
      } finally {
        gl.bindVertexArray(oldVao);
      }
    },
    onRemove(_map, gl) {
      map.off('webglcontextlost', lost);
      map.off('webglcontextrestored', restored);
      dispose(gl);
    },
  };
}
