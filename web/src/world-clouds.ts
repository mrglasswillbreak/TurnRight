import {
  createTileMesh,
  type CustomLayerInterface,
  type CustomRenderMethodInput,
} from 'maplibre-gl';
import { cloudOpacity } from './world-motion';

/** The map projects these subdivided tiles, including its horizon and pole clipping. */
export function worldClouds(
  state: { time: number; enabled: boolean; zoom: number },
  failed: () => void,
): CustomLayerInterface {
  const programs = new Map<string, WebGLProgram>();
  const buffers: {
    x: number;
    y: number;
    vertex: WebGLBuffer;
    index: WebGLBuffer;
    count: number;
  }[] = [];
  let unavailable = false;
  function shader(gl: WebGL2RenderingContext, type: number, source: string) {
    const value = gl.createShader(type)!;
    gl.shaderSource(value, source);
    gl.compileShader(value);
    if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(value);
      gl.deleteShader(value);
      throw new Error(message || 'Cloud shader unavailable');
    }
    return value;
  }
  function program(gl: WebGL2RenderingContext, input: CustomRenderMethodInput) {
    const { shaderData } = input;
    let value = programs.get(shaderData.variantName);
    if (value) return value;
    const vertex = shader(
      gl,
      gl.VERTEX_SHADER,
      `#version 300 es
      ${shaderData.vertexShaderPrelude}
      ${shaderData.define}
      in vec2 a_pos;
      out highp vec3 v_sphere;
      uniform vec2 u_tile;
      void main() {
        gl_Position = projectTile(a_pos, a_pos);
        vec2 mercator = (u_tile + a_pos / 8192.0) / 4.0;
        float lon = mercator.x * 6.28318530718;
        float lat = 2.0 * atan(exp(3.14159265359 - mercator.y * 6.28318530718)) - 1.57079632679;
        if (a_pos.y < -32767.0) lat = 1.57079632679;
        if (a_pos.y > 32766.0) lat = -1.57079632679;
        v_sphere = vec3(cos(lat)*cos(lon), sin(lat), cos(lat)*sin(lon));
      }`,
    );
    const fragment = shader(
      gl,
      gl.FRAGMENT_SHADER,
      `#version 300 es
      precision highp float;
      in highp vec3 v_sphere;
      uniform float u_time;
      uniform float u_opacity;
      out vec4 colour;
      float hash(vec3 p) { return fract(sin(dot(p,vec3(127.1,311.7,74.7))) * 43758.5453); }
      float noise(vec3 p) {
        vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      void main() {
        vec3 p=normalize(v_sphere);
        float a=u_time*0.0008;
        p.xz=mat2(cos(a),-sin(a),sin(a),cos(a))*p.xz;
        p=p*7.0 + vec3(noise(p*3.0)*1.4,0,0);
        float n=noise(p)*0.55+noise(p*2.1)*0.27+noise(p*4.3)*0.13+noise(p*8.5)*0.05;
        float alpha=smoothstep(0.46,0.72,n)*u_opacity;
        colour=vec4(vec3(0.98)*alpha,alpha);
      }`,
    );
    value = gl.createProgram()!;
    gl.attachShader(value, vertex);
    gl.attachShader(value, fragment);
    gl.linkProgram(value);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(value, gl.LINK_STATUS)) {
      gl.deleteProgram(value);
      throw new Error('Cloud program unavailable');
    }
    programs.set(shaderData.variantName, value);
    return value;
  }
  return {
    id: 'world-clouds',
    type: 'custom',
    renderingMode: '2d',
    onAdd(_map, gl) {
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) {
          const mesh = createTileMesh(
            {
              granularity: 32,
              extendToNorthPole: y === 0,
              extendToSouthPole: y === 3,
            },
            '16bit',
          );
          const vertex = gl.createBuffer()!,
            index = gl.createBuffer()!;
          gl.bindBuffer(gl.ARRAY_BUFFER, vertex);
          gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index);
          gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
          buffers.push({
            x,
            y,
            vertex,
            index,
            count: mesh.indices.byteLength / 2,
          });
        }
    },
    render(gl, input) {
      if (unavailable || !state.enabled || cloudOpacity(state.zoom) <= 0)
        return;
      try {
        const p = program(gl, input),
          at = gl.getAttribLocation(p, 'a_pos');
        const uniform = (name: string) => gl.getUniformLocation(p, name);
        gl.useProgram(p);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.STENCIL_TEST);
        gl.disable(gl.CULL_FACE);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.uniform1f(uniform('u_time'), state.time);
        gl.uniform1f(uniform('u_opacity'), cloudOpacity(state.zoom));
        for (const tile of buffers) {
          const data = input.getProjectionData({
            tileID: { canonical: { x: tile.x, y: tile.y, z: 2 } },
            applyGlobeMatrix: true,
          });
          gl.uniformMatrix4fv(
            uniform('u_projection_matrix'),
            false,
            data.mainMatrix,
          );
          gl.uniformMatrix4fv(
            uniform('u_projection_fallback_matrix'),
            false,
            data.fallbackMatrix,
          );
          gl.uniform4fv(
            uniform('u_projection_tile_mercator_coords'),
            data.tileMercatorCoords,
          );
          gl.uniform4fv(
            uniform('u_projection_clipping_plane'),
            data.clippingPlane,
          );
          gl.uniform1f(
            uniform('u_projection_transition'),
            data.projectionTransition,
          );
          gl.uniform2f(uniform('u_tile'), tile.x, tile.y);
          gl.bindBuffer(gl.ARRAY_BUFFER, tile.vertex);
          gl.enableVertexAttribArray(at);
          gl.vertexAttribPointer(at, 2, gl.SHORT, false, 0, 0);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, tile.index);
          gl.drawElements(gl.TRIANGLES, tile.count, gl.UNSIGNED_SHORT, 0);
        }
      } catch {
        unavailable = true;
        queueMicrotask(failed);
      }
    },
    onRemove(_map, gl) {
      for (const tile of buffers) {
        gl.deleteBuffer(tile.vertex);
        gl.deleteBuffer(tile.index);
      }
      for (const p of programs.values()) gl.deleteProgram(p);
      buffers.length = 0;
      programs.clear();
    },
  };
}
