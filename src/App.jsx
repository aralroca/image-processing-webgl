import { h } from 'preact';
import { useRef } from 'preact/hooks'

import './App.css';

const vertices = [
  -1,
  -1,
  1,
  -1,
  -1,
  1,
  -1,
  1,
  1,
  1,
  1,
  -1,
];

const textureCoordinates = vertices.map(v => v === -1 ? 0 : v)

function getShader(gl, shaderSource, shaderType) {
  const shader = gl.createShader(shaderType);

  gl.shaderSource(shader, shaderSource);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

function getProgram(gl, vertexShaderSource, fragmentShaderSource) {
  const vs = getShader(gl, vertexShaderSource, gl.VERTEX_SHADER);
  const fs = getShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER);
  const program = gl.createProgram();

  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.COMPILE_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
  }

  return program;
}

function createAndBindBuffer(gl, bufferType, typeOfDrawing, data) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(bufferType, buffer);
  gl.bufferData(bufferType, data, typeOfDrawing);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return buffer;
}

function createAndBindTexture(gl, image) {
  const texture = gl.createTexture();

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return texture;
}

function linkGPUAndCPU(gl, obj) {
  var position = gl.getAttribLocation(obj.program, obj.gpuVariable);
  gl.enableVertexAttribArray(position);
  gl.bindBuffer(obj.channel || gl.ARRAY_BUFFER, obj.buffer);
  gl.vertexAttribPointer(
    position,
    obj.dims,
    obj.dataType || gl.FLOAT,
    obj.normalize || gl.FALSE,
    obj.stride || 0,
    obj.offset || 0
  );
  return position;
}

const vertexShader = `#version 300 es
precision mediump float;
in vec2 position; // vertices : WebGL vertex coordinates
in vec2 texCoords; // Texture coordinates
out vec2 textureCoords; // Take input from vertex shader and serve to fragment shader
void main () {
    gl_Position = vec4(position.x, position.y * -1.0, 0.0, 1.0);
    textureCoords = texCoords;
}
`;

const fragmentShader = `#version 300 es
precision mediump float;
in vec2 textureCoords;
uniform sampler2D uImage, uColorPalette;
uniform float activeIndex, uKernel[9], kernelWeight;
out vec4 color;
uniform bool isGrayscale, isInverse, isKernel, isColorPalette;
uniform vec2 pixelJumpFactor;
vec4 applyKernel () {
    ivec2 dims = textureSize(uImage, 0);
    vec2 pixelJumpFactor = 1.0/vec2(dims);
    vec4 values = 
    texture(uImage, textureCoords + pixelJumpFactor * vec2(-1,-1)) * uKernel[0] +
    texture(uImage, textureCoords + pixelJumpFactor * vec2(0,-1)) * uKernel[1] +
    texture(uImage, textureCoords + pixelJumpFactor * vec2(1,-1)) * uKernel[2] +
    texture(uImage, textureCoords + pixelJumpFactor * vec2(-1,0)) * uKernel[3] +
    texture(uImage, textureCoords + pixelJumpFactor * vec2(0,0)) * uKernel[4] +
    texture(uImage, textureCoords + pixelJumpFactor * vec2(1,0)) * uKernel[5] +
    texture(uImage, textureCoords + pixelJumpFactor * vec2(-1,1)) * uKernel[6] +
    texture(uImage, textureCoords + pixelJumpFactor * vec2(0,1)) * uKernel[7] +
    texture(uImage, textureCoords + pixelJumpFactor * vec2(1,1)) * uKernel[8];
    vec4 updatePixels = vec4(vec3((values/kernelWeight).rgb), 1.0);
    return updatePixels;
}
void main() {
    vec4 tex1 = texture(uImage, textureCoords);
    if(isGrayscale) {
        float newPixelVal = tex1.r * 0.59 + tex1.g* 0.3 + tex1.b * 0.11;
        tex1 = vec4(vec3(newPixelVal), 1.0);
    } else if(isInverse) {
        tex1 = vec4(vec3(1.0 - tex1.rgb), 1.0);
    } else if(isKernel) {
        tex1 = applyKernel();
    } else if(isColorPalette) {
        tex1 = texture(uColorPalette, vec2(tex1.r, 0.0));
    }
    color = tex1; //vec4(vec3(textureCoords.x), 1.0);
}
`;

let img

function App() {
  const canvas = useRef()
  const constants = useRef({})

  function onChangeFile(e) {
    const reader = new FileReader()
    reader.onload = (e) => {
      img = new Image()
      img.src = e.target.result
      img.onload = onLoadImage
    }
    reader.readAsDataURL(e.target.files[0])
  }

  function onLoadImage() {
    const gl = canvas.current.getContext("webgl2", { preserveDrawingBuffer: true });
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const program = getProgram(gl, vertexShader, fragmentShader);
    const buffer = createAndBindBuffer(
      gl,
      gl.ARRAY_BUFFER,
      gl.STATIC_DRAW,
      new Float32Array(vertices)
    );

    const texBuffer = createAndBindBuffer(
      gl,
      gl.ARRAY_BUFFER,
      gl.STATIC_DRAW,
      new Float32Array(textureCoordinates)
    );

    const texture = createAndBindTexture(gl, img);

    linkGPUAndCPU(gl, {
      program: program,
      buffer: buffer,
      dims: 2,
      gpuVariable: "position",
    });
    linkGPUAndCPU(gl, {
      program: program,
      buffer: texBuffer,
      dims: 2,
      gpuVariable: "texCoords",
    });
    gl.activeTexture(gl.TEXTURE0 + 0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // gl.activeTexture(gl.TEXTURE0 + 1);
    // gl.bindTexture(gl.TEXTURE_2D, paletteTexture);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 2);

    constants.current = { gl }
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>Image processing examples in WebGL</h1>
      </header>
      <input type="file" onChange={onChangeFile}>Choose your image here</input>
      <canvas width={500} height={500} ref={canvas} />
    </div>
  );
}

export default App;
